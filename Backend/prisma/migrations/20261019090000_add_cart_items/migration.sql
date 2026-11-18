-- Each user has one cart; a product occurs at most once in that cart.
CREATE TABLE "CartItem" (
    "userId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("userId", "productId"),
    CONSTRAINT "CartItem_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
