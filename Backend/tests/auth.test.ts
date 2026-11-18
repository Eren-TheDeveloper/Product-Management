import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

process.env.JWT_ACCESS_SECRET = 'auth-tests-only-access-secret';
process.env.JWT_REFRESH_SECRET = 'auth-tests-only-refresh-secret';
process.env.JWT_TOKEN_EXPIRE = '15m';
process.env.JWT_REFRESH_EXPIRE = '7d';
const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/db/db.js');
const app = createApp();
const password = 'test-password';
const user = {
    id: 'auth-test-user', name: 'Test User', email: 'auth@example.com',
    password: await bcrypt.hash(password, 4), role: 'user',
};
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let saved: Array<{ token: string; userId: string }>;
const restorers: Array<() => void> = [];

function stub(target: object, method: string, value: (...args: any[]) => any) {
    const delegate = target as Record<string, unknown>;
    const original = delegate[method];
    delegate[method] = value;
    restorers.push(() => { delegate[method] = original; });
}

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
});
beforeEach(() => {
    saved = [];
    stub(prisma.user, 'findUnique', async () => user);
    stub(prisma.token, 'create', async ({ data }) => {
        const row = { token: data.token, userId: data.user.connect.id };
        saved.push(row);
        return { id: `row-${saved.length}`, ...row };
    });
});
afterEach(() => {
    for (const restore of restorers.splice(0).reverse()) restore();
});
after(async () => {
    await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()),
    );
    await prisma.$disconnect();
});

const login = (inputPassword = password) => fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: inputPassword }),
});

function verify(token: string, kind: 'access' | 'refresh') {
    const payload = jwt.verify(token, kind === 'access'
        ? process.env.JWT_ACCESS_SECRET!
        : process.env.JWT_REFRESH_SECRET!, {
        algorithms: ['HS256'], subject: kind === 'access' ? 'accessApi' : 'refreshToken',
    });
    assert.equal(typeof payload, 'object');
    if (typeof payload === 'string') throw new Error('Expected JWT payload');
    assert.equal(payload.id, user.id);
    assert.equal(payload.exp! - payload.iat!, kind === 'access' ? 900 : 604800);
    return payload;
}

test('login returns signed tokens only after saving the refresh token for the correct user', async () => {
    const response = await login();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    const body = await response.json();
    verify(body.accessToken, 'access');
    verify(body.refreshToken, 'refresh');
    assert.deepEqual(saved, [{ token: body.refreshToken, userId: user.id }]);
    assert.deepEqual(body.user, {
        id: user.id, name: user.name, email: user.email, role: user.role,
    });
    assert.equal(body.user.password, undefined);
});

test('each login creates a distinct refresh token and persistence row', async () => {
    const first = await (await login()).json();
    const second = await (await login()).json();
    assert.notEqual(first.refreshToken, second.refreshToken);
    assert.notEqual(verify(first.refreshToken, 'refresh').jti, verify(second.refreshToken, 'refresh').jti);
    assert.equal(saved.length, 2);
});

test('wrong password never writes or returns tokens', async () => {
    const response = await login('wrong-password');
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.accessToken, undefined);
    assert.equal(body.refreshToken, undefined);
    assert.equal(saved.length, 0);
});

test('registration rejects missing or invalid names before accessing the database', async () => {
    let reads = 0;
    stub(prisma.user, 'findUnique', async () => { reads++; return null; });
    for (const name of [undefined, null, 42, [], {}, '', '   ', 'x'.repeat(101)]) {
        const response = await fetch(`${baseUrl}/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email: user.email, password }),
        });
        assert.equal(response.status, 400);
    }
    assert.equal(reads, 0);
    assert.equal(saved.length, 0);
});

test('login rejects non-string credentials before accessing the database', async () => {
    let reads = 0;
    stub(prisma.user, 'findUnique', async () => { reads++; return user; });
    for (const body of [{ email: [user.email], password }, { email: user.email, password: [password] }]) {
        const response = await fetch(`${baseUrl}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
    }
    assert.equal(reads, 0);
});

test('failed refresh token persistence prevents a successful login response', async () => {
    stub(prisma.token, 'create', async () => { throw { code: 'P1002' }; });
    const response = await login();
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'DATABASE_UNAVAILABLE');
    assert.equal(body.accessToken, undefined);
    assert.equal(body.refreshToken, undefined);
});

test('logout removes only the submitted refresh token belonging to that user', async () => {
    const first = await (await login()).json();
    const second = await (await login()).json();
    stub(prisma.token, 'deleteMany', async ({ where }) => {
        assert.deepEqual(where, { token: first.refreshToken, userId: user.id });
        saved = saved.filter((row) => row.token !== where.token || row.userId !== where.userId);
        return { count: 1 };
    });
    const response = await fetch(`${baseUrl}/logout`, {
        method: 'POST', headers: { Authorization: `Bearer ${first.refreshToken}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(saved, [{ token: second.refreshToken, userId: user.id }]);
});
