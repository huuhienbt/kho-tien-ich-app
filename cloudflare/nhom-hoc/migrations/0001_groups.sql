CREATE TABLE IF NOT EXISTS NhomHoc (
 ma_nhom TEXT PRIMARY KEY, ten_nhom TEXT NOT NULL, nam_hoc TEXT NOT NULL DEFAULT '',
 thu_trong_tuan TEXT NOT NULL DEFAULT '', gio_bat_dau TEXT NOT NULL DEFAULT '', gio_ket_thuc TEXT NOT NULL DEFAULT '',
 giao_vien_id TEXT NOT NULL DEFAULT 'admin', cach_tinh_hoc_phi TEXT NOT NULL,
 don_gia_vnd INTEGER NOT NULL CHECK(don_gia_vnd BETWEEN 0 AND 1000000000), trang_thai TEXT NOT NULL, ghi_chu TEXT NOT NULL DEFAULT '',
 so_buoi_moi_ky INTEGER NOT NULL DEFAULT 0, ky_bat_dau TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS HocSinh (ma_hoc_sinh TEXT PRIMARY KEY, ho_ten TEXT NOT NULL, lop TEXT NOT NULL DEFAULT '', trang_thai TEXT NOT NULL, ghi_chu TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS ThanhVienNhom (
 ma_thanh_vien TEXT PRIMARY KEY, ma_nhom TEXT NOT NULL REFERENCES NhomHoc(ma_nhom), ma_hoc_sinh TEXT NOT NULL REFERENCES HocSinh(ma_hoc_sinh),
 ngay_vao TEXT NOT NULL, ngay_nghi TEXT NOT NULL DEFAULT '', don_gia_rieng_vnd NUMERIC NOT NULL DEFAULT '', trang_thai TEXT NOT NULL, ghi_chu TEXT NOT NULL DEFAULT '', UNIQUE(ma_nhom,ma_hoc_sinh)
);
CREATE TABLE IF NOT EXISTS BuoiHoc (
 ma_buoi TEXT PRIMARY KEY, ma_nhom TEXT NOT NULL REFERENCES NhomHoc(ma_nhom), ngay_hoc TEXT NOT NULL, gio_bat_dau TEXT NOT NULL DEFAULT '', gio_ket_thuc TEXT NOT NULL DEFAULT '', trang_thai TEXT NOT NULL, ghi_chu TEXT NOT NULL DEFAULT '', UNIQUE(ma_nhom,ngay_hoc)
);
CREATE TABLE IF NOT EXISTS DiemDanh (
 ma_buoi TEXT NOT NULL REFERENCES BuoiHoc(ma_buoi), ma_hoc_sinh TEXT NOT NULL REFERENCES HocSinh(ma_hoc_sinh), trang_thai TEXT NOT NULL CHECK(trang_thai IN ('co_mat','vang','chua_diem_danh')),
 ghi_chu TEXT NOT NULL DEFAULT '', nguoi_cap_nhat_id TEXT NOT NULL DEFAULT '', cap_nhat_luc TEXT NOT NULL DEFAULT '', PRIMARY KEY(ma_buoi,ma_hoc_sinh)
);
CREATE TABLE IF NOT EXISTS ThuHocPhi (
 ma_thu TEXT PRIMARY KEY, ma_nhom TEXT NOT NULL REFERENCES NhomHoc(ma_nhom), ma_hoc_sinh TEXT NOT NULL REFERENCES HocSinh(ma_hoc_sinh), ky_thu TEXT NOT NULL,
 so_tien_vnd INTEGER NOT NULL CHECK(so_tien_vnd BETWEEN 0 AND 1000000000), ngay_dong TEXT NOT NULL, phuong_thuc TEXT NOT NULL, trang_thai TEXT NOT NULL, nguoi_thu_id TEXT NOT NULL, ghi_chu TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS HocPhiKy (
 ma_chot TEXT PRIMARY KEY, ma_nhom TEXT NOT NULL REFERENCES NhomHoc(ma_nhom), ma_hoc_sinh TEXT NOT NULL REFERENCES HocSinh(ma_hoc_sinh), ky_thu TEXT NOT NULL,
 so_buoi INTEGER NOT NULL, cach_tinh TEXT NOT NULL, don_gia_vnd INTEGER NOT NULL, phai_thu_vnd INTEGER NOT NULL, trang_thai TEXT NOT NULL, nguoi_chot_id TEXT NOT NULL, chot_luc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS members_student ON ThanhVienNhom(ma_hoc_sinh);
CREATE INDEX IF NOT EXISTS sessions_group_date ON BuoiHoc(ma_nhom,ngay_hoc);
CREATE INDEX IF NOT EXISTS receipts_period ON ThuHocPhi(ma_nhom,ky_thu,ma_hoc_sinh);
CREATE INDEX IF NOT EXISTS bills_period ON HocPhiKy(ma_nhom,ky_thu,trang_thai);
CREATE TABLE IF NOT EXISTS nh_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0, write_token TEXT NOT NULL DEFAULT '', migrated_at TEXT NOT NULL DEFAULT '');
INSERT OR IGNORE INTO nh_meta(id) VALUES(1);
CREATE TABLE IF NOT EXISTS nh_teachers (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active');
CREATE TABLE IF NOT EXISTS nh_sessions (token_hash TEXT PRIMARY KEY, sub TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_expiry ON nh_sessions(expires_at);
CREATE TABLE IF NOT EXISTS nh_audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, changed_rows INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS audit_date ON nh_audit(created_at);
CREATE TABLE IF NOT EXISTS nh_files (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES NhomHoc(ma_nhom), object_key TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, created_by TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','ready','deleting'))
);
CREATE INDEX IF NOT EXISTS files_group ON nh_files(group_id,status,created_at);
