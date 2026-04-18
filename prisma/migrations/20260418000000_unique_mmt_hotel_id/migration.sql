-- Collapse duplicates so we can enforce a global unique on mmtHotelId.
-- Keep the most recently scraped row per mmtHotelId; break ties by id.
DELETE FROM "Hotel"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("mmtHotelId") "id"
  FROM "Hotel"
  ORDER BY "mmtHotelId", "scrapedAt" DESC, "id" DESC
);

-- DropIndex
DROP INDEX IF EXISTS "Hotel_searchId_mmtHotelId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_mmtHotelId_key" ON "Hotel"("mmtHotelId");
