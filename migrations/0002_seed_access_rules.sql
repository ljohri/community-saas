INSERT OR IGNORE INTO page_access_rules
(path_prefix, requires_login, requires_active_member, requires_fee_paid, requires_admin)
VALUES
('/members', 1, 1, 1, 0),
('/admin', 1, 0, 0, 1);
