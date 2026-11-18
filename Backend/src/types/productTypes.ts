type ProductData = {
    name: string,
    price: number,
    stock: number
}

type UpdateStock = {
    name: string,
    stock: string,
}

type UpdatePrice = {
    name: string,
    price: number
}

type UserData = {
    name: string,
    email: string,
    password: string,
    role: 'admin' | 'user'
}

type DeleteProduct = {
    name: string
}

export { ProductData, UpdatePrice, UpdateStock, UserData, DeleteProduct };