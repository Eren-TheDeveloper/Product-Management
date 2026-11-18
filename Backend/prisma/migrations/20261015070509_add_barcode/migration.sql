/*
  Warnings:

  - The primary key for the `Products` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Products` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The required column `barcode` was added to the `Products` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Products" DROP CONSTRAINT "Products_pkey",
ADD COLUMN     "barcode" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "stock" SET DEFAULT 0,
ADD CONSTRAINT "Products_pkey" PRIMARY KEY ("id");
