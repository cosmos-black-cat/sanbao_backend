// init-db.js - 初始化資料庫
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./sanbao.db');

console.log('正在初始化資料庫...');

db.serialize(() => {
    // 建立 violations 表
    db.run(`
        CREATE TABLE IF NOT EXISTS violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_plate TEXT NOT NULL,
            violation_type TEXT NOT NULL,
            severity INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 建立 vehicle_scores 表
    db.run(`
        CREATE TABLE IF NOT EXISTS vehicle_scores (
            license_plate TEXT PRIMARY KEY,
            violation_count INTEGER DEFAULT 0,
            risk_score INTEGER DEFAULT 0,
            is_dangerous BOOLEAN DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 建立索引
    db.run(`CREATE INDEX IF NOT EXISTS idx_violations_plate ON violations(license_plate)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_violations_time ON violations(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_scores_dangerous ON vehicle_scores(is_dangerous)`);

    // 插入測試資料
    const violations = [
        ['ABC-1234', '急煞車', 2],
        ['ABC-1234', '亂切車道', 3],
        ['XYZ-5678', '闖紅燈', 5],
        ['XYZ-5678', '急煞車', 2],
        ['XYZ-5678', '違規停車', 1],
        ['DEF-9999', '闖紅燈', 5],
        ['DEF-9999', '逆向行駛', 5],
        ['DEF-9999', '亂切車道', 3],
        ['CAR-001', '亂切車道', 3],
        ['CAR-001', '亂切車道', 3],
        ['CAR-002', '亂切車道', 3],
        ['CAR-002', '亂切車道', 3],
        ['CAR-002', '亂切車道', 3],
        ['CAR-003', '亂切車道', 3],
    ];

    const stmt = db.prepare(`INSERT OR IGNORE INTO violations (license_plate, violation_type, severity) VALUES (?, ?, ?)`);
    violations.forEach(v => stmt.run(v));
    stmt.finalize();

    // 插入車輛評分
    const scores = [
        ['ABC-1234', 2, 25, 0],
        ['XYZ-5678', 3, 45, 1],
        ['DEF-9999', 3, 85, 1],
        ['CAR-001', 2, 55, 1],
        ['CAR-002', 3, 90, 1],
        ['CAR-003', 1, 0, 1],
        ['SAFE-001', 0, 0, 0]
    ];

    const scoreStmt = db.prepare(`INSERT OR IGNORE INTO vehicle_scores (license_plate, violation_count, risk_score, is_dangerous) VALUES (?, ?, ?, ?)`);
    scores.forEach(s => scoreStmt.run(s));
    scoreStmt.finalize();

    console.log('✅ 資料庫初始化完成！');
    console.log('測試資料已插入：ABC-1234, XYZ-5678, DEF-9999, SAFE-001');
});

db.close();