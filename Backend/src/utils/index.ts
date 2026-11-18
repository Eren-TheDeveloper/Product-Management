const genName = (): string => {
    const user: string = 'user-';
    const random = Math.random().toString(32).slice(2);
    const generatedName: string = user + random
    return generatedName;
}

const genEmail = () => {
    const randomMail: string = Math.random().toString(16).slice(2);
    const afterMail: string = '@gmail.com'
    const generatedMail: string = randomMail + afterMail;
    return generatedMail;
}

const genPassword = () => {
    const randomPassword: string = Math.random().toString(16);
    return randomPassword;
}

const name = genName()
const email = genEmail()
const password = genPassword()

console.log(name, email, password);
console.log(`{ "name": "${name}", "email": "${email}", "password": "${password}" }`)

export { genName, genEmail, genPassword };
