USE bank_sampah;

ALTER TABLE jenis_sampah
  CHANGE COLUMN harga_per_satuan harga_per_satuan_arsip BIGINT NULL;

ALTER TABLE rincian_setoran
  CHANGE COLUMN harga_per_satuan harga_per_satuan_arsip BIGINT NULL,
  CHANGE COLUMN nominal nominal_arsip BIGINT NULL;

RENAME TABLE
  pengajuan_pencairan TO arsip_pengajuan_pencairan,
  transaksi_saldo TO arsip_transaksi_saldo;

-- This legacy migration only updates table and monetary-column names.
-- It intentionally does not add point/reward fields or tables.
