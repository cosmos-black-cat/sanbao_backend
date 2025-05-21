const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

// 使用 SQLite 資料庫（簡單易用）
const db = new sqlite3.Database('./sanbao.db', (err) => {
    if (err) {
        console.error('❌ 資料庫連接失敗:', err.message);
        process.exit(1);
    }
    console.log('✅ 資料庫連接成功');
});

// 檢查資料庫表格是否存在
function checkDatabase() {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='violations'", (err, row) => {
        if (err) {
            console.error('❌ 檢查資料庫時發生錯誤:', err.message);
            return;
        }
        if (!row) {
            console.log('⚠️  資料庫表格不存在，請先執行: node init-db.js');
            return;
        }
        console.log('✅ 資料庫表格檢查通過');
    });
}

// ==================== 核心 API ====================

/**
 * 查詢車牌是否為三寶 (最重要的API)
 * GET /api/check/:plate
 */
app.get('/api/check/:plate', (req, res) => {
    const plate = req.params.plate;

    const query = `
        SELECT * FROM vehicle_scores 
        WHERE license_plate = ?
    `;

    db.get(query, [plate], (err, row) => {
        if (err) {
            return res.status(500).json({ error: '查詢失敗' });
        }

        if (!row) {
            // 沒有記錄 = 安全車輛
            return res.json({
                plate: plate,
                isSafe: true,
                riskScore: 0,
                message: '✅ 安全車輛'
            });
        }

        // 有記錄，判斷風險等級
        const isSafe = !row.is_dangerous;
        const message = getWarningMessage(row.risk_score);

        res.json({
            plate: plate,
            isSafe: isSafe,
            riskScore: row.risk_score,
            violationCount: row.violation_count,
            message: message
        });
    });
});

/**
 * 新增違規記錄
 * POST /api/report
 */
app.post('/api/report', (req, res) => {
    const { plate, violationType } = req.body;

    if (!plate || !violationType) {
        return res.status(400).json({ error: '缺少必要參數' });
    }

    // 計算嚴重程度
    const severity = getSeverity(violationType);

    // 新增違規記錄
    const insertQuery = `
        INSERT INTO violations (license_plate, violation_type, severity)
        VALUES (?, ?, ?)
    `;

    db.run(insertQuery, [plate, violationType, severity], function (err) {
        if (err) {
            return res.status(500).json({ error: '新增失敗' });
        }

        // 更新車輛評分
        updateVehicleScore(plate);

        res.json({
            success: true,
            message: '違規記錄已新增',
            violationId: this.lastID
        });
    });
});

/**
 * 取得違規歷史
 * GET /api/history/:plate
 */
app.get('/api/history/:plate', (req, res) => {
    const plate = req.params.plate;

    const query = `
        SELECT * FROM violations 
        WHERE license_plate = ? 
        ORDER BY created_at DESC 
        LIMIT 10
    `;

    db.all(query, [plate], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: '查詢失敗' });
        }

        res.json({
            plate: plate,
            violations: rows
        });
    });
});

// ==================== 輔助函數 ====================

function getSeverity(violationType) {
    const severityMap = {
        '急煞車': 2,
        '亂切車道': 3,
        '龜速行駛': 1,
        '闖紅燈': 5,
        '違規停車': 2,
        '逆向行駛': 5,
        '未保持安全距離': 3
    };
    return severityMap[violationType] || 1;
}

function getWarningMessage(riskScore) {
    if (riskScore >= 70) return '🚨 極度危險車輛！';
    if (riskScore >= 40) return '⚠️  危險車輛，保持距離';
    if (riskScore >= 20) return 'ℹ️  注意該車輛';
    return '✅ 安全車輛';
}

function updateVehicleScore(plate) {
    // 計算該車牌的違規統計
    const statsQuery = `
        SELECT 
            COUNT(*) as count,
            AVG(severity) as avgSeverity
        FROM violations 
        WHERE license_plate = ?
        AND created_at > datetime('now', '-30 days')
    `;

    db.get(statsQuery, [plate], (err, stats) => {
        if (err) return;

        // 計算風險分數 (簡化版)
        const violationCount = stats.count || 0;
        const avgSeverity = stats.avgSeverity || 1;
        const riskScore = Math.min(violationCount * 15 + avgSeverity * 5, 100);
        const isDangerous = riskScore >= 40;

        // 更新或插入評分
        const upsertQuery = `
            INSERT OR REPLACE INTO vehicle_scores 
            (license_plate, violation_count, risk_score, is_dangerous, last_updated)
            VALUES (?, ?, ?, ?, datetime('now'))
        `;

        db.run(upsertQuery, [plate, violationCount, riskScore, isDangerous]);
    });
}

// ==================== 啟動服務器 ====================

checkDatabase();

const PORT = 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Backend server 啟動成功！`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`\n測試用 API 端點：`);
    console.log(`GET  /api/check/ABC-1234    - 查詢車牌`);
    console.log(`POST /api/report            - 回報違規`);
    console.log(`GET  /api/history/ABC-1234  - 查詢歷史`);
    console.log(`\n💡 如果出現資料庫錯誤，請先執行: node init-db.js`);
});

// 處理服務器關閉
process.on('SIGINT', () => {
    console.log('\n正在關閉服務器...');
    server.close(() => {
        db.close((err) => {
            if (err) {
                console.error(err.message);
            }
            console.log('資料庫連接已關閉');
            process.exit(0);
        });
    });
});