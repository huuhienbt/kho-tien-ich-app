/* Academic results are append-only and independent of attendance/tuition periods.
   Decimal scores are text so the signed Sheets mirror preserves their exact value. */
CREATE TABLE IF NOT EXISTS DiemKiemTra (
 ma_ket_qua TEXT PRIMARY KEY, ma_hoc_sinh TEXT NOT NULL REFERENCES HocSinh(ma_hoc_sinh),
 nam_hoc TEXT NOT NULL, dot_kiem_tra TEXT NOT NULL CHECK(dot_kiem_tra IN ('gk1','ck1','gk2','ck2')),
 tieng_viet TEXT NOT NULL DEFAULT '' CHECK(tieng_viet='' OR CAST(tieng_viet AS REAL) BETWEEN 0 AND 10),
 toan TEXT NOT NULL DEFAULT '' CHECK(toan='' OR CAST(toan AS REAL) BETWEEN 0 AND 10),
 ma_lan_nhap TEXT NOT NULL, tep_nguon TEXT NOT NULL DEFAULT '', dong_nguon INTEGER NOT NULL DEFAULT 0,
 lop_nguon TEXT NOT NULL DEFAULT '', nguoi_cap_nhat_id TEXT NOT NULL, cap_nhat_luc TEXT NOT NULL,
 hoan_tac_ma TEXT NOT NULL DEFAULT '', ban_nhap_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS grades_student_period ON DiemKiemTra(ma_hoc_sinh,nam_hoc,dot_kiem_tra);
CREATE INDEX IF NOT EXISTS grades_import ON DiemKiemTra(ma_lan_nhap);
CREATE TABLE IF NOT EXISTS nh_schema_updates (id TEXT PRIMARY KEY);
UPDATE nh_meta SET revision=revision+1 WHERE id=1 AND NOT EXISTS(SELECT 1 FROM nh_schema_updates WHERE id='grades-v1');
INSERT OR IGNORE INTO nh_schema_updates(id) VALUES('grades-v1');
