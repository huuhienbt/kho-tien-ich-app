CREATE TABLE IF NOT EXISTS TienThuePhong (
 ma_dong TEXT PRIMARY KEY, buoi_da_tinh TEXT NOT NULL CHECK(json_valid(buoi_da_tinh) AND json_array_length(buoi_da_tinh)=16),
 so_buoi INTEGER NOT NULL CHECK(so_buoi=16), so_tien_vnd INTEGER NOT NULL CHECK(so_tien_vnd=1000000),
 ngay_dong TEXT NOT NULL, trang_thai TEXT NOT NULL CHECK(trang_thai IN ('da_dong','da_huy')),
 nguoi_dong_id TEXT NOT NULL, cap_nhat_luc TEXT NOT NULL, ghi_chu TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS room_rent_date ON TienThuePhong(ngay_dong,trang_thai);
/* Advance once so an existing acknowledged Drive revision cannot conflict with
   the checksum of the additional empty table. */
CREATE TABLE IF NOT EXISTS nh_schema_updates (id TEXT PRIMARY KEY);
UPDATE nh_meta SET revision=revision+1 WHERE id=1 AND NOT EXISTS(SELECT 1 FROM nh_schema_updates WHERE id='room-rent-v1');
INSERT OR IGNORE INTO nh_schema_updates(id) VALUES('room-rent-v1');
