import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseSettings } from '../src/db/settings.js';
import {
    createDatabaseLifecycle,
    databaseErrorCode,
    DatabaseUnavailableError,
    retryDatabaseOperation,
    runDatabaseQuery,
} from '../src/db/resilience.js';

const temporary = (code = 'P1001') =>
    Object.assign(new Error('private database details'), { code });
const noWait = async () => {};
const retryOptions = {
    attempts: 3,
    delayMs: 100,
    maxDelayMs: 150,
    shouldRetry: () => true,
    wait: noWait,
    random: () => 0,
};

test('connection URL gets bounded defaults and preserves credentials, SSL and pooler configuration', () => {
    const settings = databaseSettings({
        DATABASE_URL:
            'postgresql://user:p%40ss@db.example.com:5432/app?sslmode=require&pgbouncer=true&schema=custom',
    });
    const url = new URL(settings.datasourceUrl!);
    assert.equal(url.password, 'p%40ss');
    assert.equal(url.searchParams.get('sslmode'), 'require');
    assert.equal(url.searchParams.get('pgbouncer'), 'true');
    assert.equal(url.searchParams.get('schema'), 'custom');
    assert.equal(url.searchParams.get('connection_limit'), '5');
    assert.equal(url.searchParams.get('connect_timeout'), '10');
    assert.equal(url.searchParams.get('pool_timeout'), '5');
    assert.equal(url.searchParams.get('socket_timeout'), '10');
});

test('explicit URL values survive and explicit DB settings can override them', () => {
    const env = {
        DATABASE_URL:
            'postgres://user:pass@localhost/app?connection_limit=2&connect_timeout=25&pool_timeout=7&socket_timeout=30',
    };
    const preserved = new URL(databaseSettings(env).datasourceUrl!);
    assert.equal(preserved.searchParams.get('connect_timeout'), '25');
    assert.equal(preserved.searchParams.get('connection_limit'), '2');
    const changed = new URL(
        databaseSettings({ ...env, DB_CONNECTION_LIMIT: '4' }).datasourceUrl!,
    );
    assert.equal(changed.searchParams.get('connection_limit'), '4');
    assert.equal(changed.searchParams.get('socket_timeout'), '30');
});

test('bad settings fail without printing credentials', () => {
    for (const value of [
        'not-a-url-super-secret',
        'mysql://user:super-secret@localhost/db',
    ]) {
        assert.throws(
            () => databaseSettings({ DATABASE_URL: value }),
            (error) =>
                error instanceof Error &&
                !error.message.includes('super-secret'),
        );
    }
    for (const value of ['0', '-1', 'oops', '1.5', '100000']) {
        assert.throws(
            () => databaseSettings({ DB_CONNECT_ATTEMPTS: value }),
            /DB_CONNECT_ATTEMPTS/,
        );
    }
    assert.equal(databaseSettings({}).datasourceUrl, undefined);
});

test('connection retries back off with a capped delay and recover', async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await retryDatabaseOperation(
        async () => {
            if (++calls < 3) throw temporary();
            return 'connected';
        },
        {
            ...retryOptions,
            wait: async (delay) => {
                delays.push(delay);
            },
        },
    );
    assert.equal(result, 'connected');
    assert.deepEqual(delays, [100, 150]);
});

test('permanent credential errors fail immediately and exhausted retries reject', async () => {
    let calls = 0;
    await assert.rejects(
        retryDatabaseOperation(
            async () => {
                calls++;
                throw temporary('P1000');
            },
            {
                ...retryOptions,
                shouldRetry: (error) => databaseErrorCode(error) === 'P1001',
            },
        ),
        { code: 'P1000' },
    );
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(
        retryDatabaseOperation(async () => {
            calls++;
            throw temporary();
        }, retryOptions),
        { code: 'P1001' },
    );
    assert.equal(calls, 3);
});

test('abort interrupts real retry sleep without another connection attempt', async () => {
    const abort = new AbortController();
    let calls = 0;
    const pending = retryDatabaseOperation(
        async () => {
            calls++;
            throw temporary();
        },
        {
            ...retryOptions,
            wait: undefined,
            delayMs: 10_000,
            maxDelayMs: 10_000,
            signal: abort.signal,
            onRetry: () => {
                setImmediate(() => abort.abort());
            },
        },
    );
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(calls, 1);
});

test('standalone reads recover once after a closed connection', async () => {
    let calls = 0;
    const result = await runDatabaseQuery(
        { action: 'findMany', runInTransaction: false },
        async () => {
            if (++calls === 1) throw temporary('P1017');
            return [{ id: 1 }];
        },
        { attempts: 2, delayMs: 1, wait: noWait },
    );
    assert.deepEqual(result, [{ id: 1 }]);
    assert.equal(calls, 2);
});

test('lazy Prisma initialization errors without codes are recognized narrowly', () => {
    const message = "Can't reach database server at private-host";
    assert.equal(
        databaseErrorCode({ name: 'PrismaClientInitializationError', message }),
        'P1001',
    );
    assert.equal(databaseErrorCode(new Error(message)), undefined);
    assert.equal(
        databaseErrorCode({
            name: 'PrismaClientInitializationError',
            message: 'Authentication failed',
        }),
        undefined,
    );
});

for (const action of [
    'create',
    'update',
    'delete',
    'upsert',
    'createMany',
    'executeRaw',
    'queryRaw',
]) {
    test(`${action} is never replayed after ambiguous connection loss`, async () => {
        let calls = 0;
        await assert.rejects(
            runDatabaseQuery(
                { action, runInTransaction: false },
                async () => {
                    calls++;
                    throw temporary('P1017');
                },
                { attempts: 2, delayMs: 1, wait: noWait },
            ),
            (error) =>
                error instanceof DatabaseUnavailableError &&
                error.databaseCode === 'P1017' &&
                !error.message.includes('private'),
        );
        assert.equal(calls, 1);
    });
}

test('transaction reads, pool exhaustion and query timeouts are not retried', async () => {
    for (const [code, transaction] of [
        ['P1017', true],
        ['P2024', false],
        ['P1008', false],
    ] as const) {
        let calls = 0;
        await assert.rejects(
            runDatabaseQuery(
                { action: 'findMany', runInTransaction: transaction },
                async () => {
                    calls++;
                    throw temporary(code);
                },
                { attempts: 2, delayMs: 1, wait: noWait },
            ),
            DatabaseUnavailableError,
        );
        assert.equal(calls, 1);
    }
});

test('business and transaction-conflict errors are preserved for existing handlers', async () => {
    for (const code of ['P2002', 'P2025', 'P2034', 'P2028']) {
        const failure = temporary(code);
        await assert.rejects(
            runDatabaseQuery(
                { action: 'findMany', runInTransaction: false },
                async () => {
                    throw failure;
                },
                {
                    attempts: 2,
                    delayMs: 1,
                    wait: noWait,
                },
            ),
            (error) => error === failure,
        );
    }
});

test('concurrent startup calls share one verified connection and disconnect once', async () => {
    let connects = 0,
        probes = 0,
        disconnects = 0;
    const lifecycle = createDatabaseLifecycle(
        {
            $connect: async () => {
                connects++;
            },
            $disconnect: async () => {
                disconnects++;
            },
        },
        async () => {
            probes++;
        },
        retryOptions,
    );
    const first = lifecycle.connect();
    assert.equal(lifecycle.connect(), first);
    await Promise.all(Array.from({ length: 20 }, () => lifecycle.connect()));
    assert.equal(connects, 1);
    assert.equal(probes, 1);
    await Promise.all([lifecycle.disconnect(), lifecycle.disconnect()]);
    assert.equal(disconnects, 1);
    await assert.rejects(lifecycle.connect(), /shutting down/);
});

test('startup retries both unreachable connections and failed verification queries', async () => {
    let connects = 0,
        probes = 0;
    const lifecycle = createDatabaseLifecycle(
        {
            $connect: async () => {
                if (++connects === 1) throw temporary();
            },
            $disconnect: noWait,
        },
        async () => {
            if (++probes === 1) throw temporary('P1017');
        },
        retryOptions,
    );
    await lifecycle.connect();
    assert.equal(connects, 3);
    assert.equal(probes, 2);
    await lifecycle.disconnect();
});

test('a failed startup does not permanently cache its rejection', async () => {
    let failing = true;
    const lifecycle = createDatabaseLifecycle(
        {
            $connect: async () => {
                if (failing) throw temporary('P1000');
            },
            $disconnect: noWait,
        },
        noWait,
        retryOptions,
    );
    await assert.rejects(lifecycle.connect(), { code: 'P1000' });
    failing = false;
    await lifecycle.connect();
    await lifecycle.disconnect();
});

test('readiness coalesces simultaneous probes but checks the database again next time', async () => {
    let probes = 0;
    const lifecycle = createDatabaseLifecycle(
        { $connect: noWait, $disconnect: noWait },
        async () => {
            if (++probes > 1) throw temporary();
        },
        retryOptions,
    );
    await Promise.all(Array.from({ length: 20 }, () => lifecycle.check()));
    assert.equal(probes, 1);
    await assert.rejects(lifecycle.check(), { code: 'P1001' });
    await lifecycle.disconnect();
});

test('shutdown cancels startup backoff, waits for cleanup and never retries afterward', async () => {
    let calls = 0,
        disconnects = 0;
    let onRetry!: () => void;
    const retryStarted = new Promise<void>((resolve) => {
        onRetry = resolve;
    });
    const lifecycle = createDatabaseLifecycle(
        {
            $connect: async () => {
                calls++;
                throw temporary();
            },
            $disconnect: async () => {
                disconnects++;
            },
        },
        noWait,
        {
            ...retryOptions,
            wait: undefined,
            delayMs: 10_000,
            maxDelayMs: 10_000,
            onRetry,
        },
    );
    const pending = lifecycle.connect();
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await retryStarted;
    await lifecycle.disconnect();
    await rejected;
    assert.equal(calls, 1);
    assert.equal(disconnects, 1);
    await assert.rejects(lifecycle.check(), /shutting down/);
});

test('shutdown waits for an in-flight connect and does not start a verification query afterward', async () => {
    let release!: () => void;
    const connecting = new Promise<void>((resolve) => {
        release = resolve;
    });
    let probes = 0,
        disconnects = 0;
    const lifecycle = createDatabaseLifecycle(
        {
            $connect: () => connecting,
            $disconnect: async () => {
                disconnects++;
            },
        },
        async () => {
            probes++;
        },
        retryOptions,
    );
    const pending = lifecycle.connect();
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    const closing = lifecycle.disconnect();
    assert.equal(disconnects, 0);
    release();
    await closing;
    await rejected;
    assert.equal(probes, 0);
    assert.equal(disconnects, 1);
});
