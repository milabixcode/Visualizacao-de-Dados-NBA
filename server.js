import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { run, exec } from './src/db.js';
import { globby } from 'globby';

function toJSONSafe(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => {
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'string' && /^[0-9.,]+$/.test(v)) {
      return Number(v.replace(/\./g, '').replace(',', '.'));
    }
    return v;
  }));
}

async function queryWithFallback(sqlUsingClean, sqlUsingRaw, res) {
  try {
    const rows = await run(sqlUsingClean);
    const safe = toJSONSafe(rows);
    if (res) return res.json(safe);
    return safe;
  } catch (e1) {
    try {
      const rows = await run(sqlUsingRaw);
      const safe = toJSONSafe(rows);
      if (res) return res.json(safe);
      return safe;
    } catch (e2) {
      const errMsg = e2.message || e1.message;
      if (res) return res.status(500).json({ error: errMsg });
      throw new Error(errMsg);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function findDataFiles() {
  const csvFiles = await globby(['data/**/*.csv'], { absolute: false });
  return csvFiles.map(f => path.join(__dirname, f).replace(/\\/g, '/'));
}

async function detectSchema(filePath) {
  try {
    const escapedPath = filePath.replace(/'/g, "''");
    const sample = await run(`SELECT * FROM read_csv_auto('${escapedPath}') LIMIT 1;`);
    if (sample && sample.length > 0) {
      return Object.keys(sample[0]);
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function ingestAll(startDate = null, endDate = null) {
  const files = await findDataFiles();
  if (!files.length) {
    throw new Error("Nenhum arquivo CSV encontrado em data/");
  }

  try {
    await exec(`DROP VIEW IF EXISTS games;`);
    await exec(`DROP VIEW IF EXISTS games_clean;`);
    await exec(`DROP VIEW IF EXISTS players;`);
    await exec(`DROP VIEW IF EXISTS players_clean;`);
  } catch (e) {
    // Ignore errors
  }

  const gamesFile = files.find(f => /^game\.csv$/i.test(f)) ||
                    files.find(f => /game_summary\.csv$/i.test(f)) ||
                    files.find(f => /game_info\.csv$/i.test(f)) ||
                    files.find(f => /game|match|box/i.test(f)) || 
                    files[0];

  const escaped = gamesFile.replace(/'/g, "''");
  
  try {
    await exec(`
      CREATE OR REPLACE VIEW games AS
      SELECT *
      FROM read_csv_auto('${escaped}', header=true, auto_detect=true);
    `);
  } catch (e) {
    const altFile = files.find(f => f !== gamesFile && /game/i.test(f));
    if (altFile) {
      const altEscaped = altFile.replace(/'/g, "''");
      try {
        await exec(`
          CREATE OR REPLACE VIEW games AS
          SELECT *
          FROM read_csv_auto('${altEscaped}', header=true, auto_detect=true);
        `);
      } catch (e2) {
        throw new Error(`Não foi possível ler os arquivos CSV. Erro: ${e2.message}`);
      }
    } else {
      throw new Error(`Não foi possível ler o arquivo ${path.basename(gamesFile)}: ${e.message}`);
    }
  }

  try {
    await exec(`
      CREATE OR REPLACE VIEW games_clean AS
      SELECT *
      FROM games
      WHERE 1=1;
    `);
  } catch (e) {
    try {
      await exec(`
        CREATE OR REPLACE VIEW games_clean AS
        SELECT * FROM games;
      `);
    } catch (e2) {
      throw e2;
    }
  }
}

app.post('/api/ingest', async (req, res) => {
  try {
    const { start = null, end = null } = req.body || {};
    await ingestAll(start, end);
    const meta = await run(`SELECT CAST(COUNT(*) AS DOUBLE) AS cnt FROM games;`);
    const rows = (meta && meta[0] && meta[0].cnt) ? meta[0].cnt : 0;
    res.json({ ok: true, rows });
  } catch (e) {
    console.error('Erro na ingestão:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/meta', async (req, res) => {
  try {
    const [{ rows }] = await run("SELECT CAST(COUNT(*) AS DOUBLE) AS rows FROM games");
    res.json({ rows, min: null, max: null });
  } catch (e) {
    res.json({ rows: 0, min: null, max: null });
  }
});

async function getAvailableColumns() {
  try {
    const sample = await run(`SELECT * FROM games LIMIT 1;`);
    if (sample && sample.length > 0) {
      return Object.keys(sample[0]);
    }
    return [];
  } catch (e) {
    return [];
  }
}

function escapeColumnName(colName) {
  if (/[^a-zA-Z0-9_]/.test(colName)) {
    return `"${colName.replace(/"/g, '""')}"`;
  }
  return colName;
}

app.get('/api/seasonal', async (req, res) => {
  try {
    const columns = await getAvailableColumns();
    
    const columnsLower = columns.map(c => c.toLowerCase());
    const dateCol = columns.find(c => /^game_date$/i.test(c)) ||
                    columns.find(c => /game_date_est/i.test(c)) ||
                    columns.find(c => /date/i.test(c)) ||
                    null;
    
    const gameIdCol = columns.find(c => /^game_id$/i.test(c)) ||
                      columns.find(c => /gameid/i.test(c)) ||
                      null;
    
    if (!gameIdCol) {
      return res.status(500).json({ 
        error: 'Coluna game_id não encontrada no dataset. Não é possível contar jogos únicos.' 
      });
    }
    
    if (!dateCol) {
      return res.status(500).json({ 
        error: 'Coluna game_date não encontrada no dataset.' 
      });
    }
    
    const dateColEscaped = escapeColumnName(dateCol);
    const gameIdColEscaped = escapeColumnName(gameIdCol);
    const hasDateCol = columnsLower.includes(dateCol.toLowerCase());
    
    if (!hasDateCol) {
      return res.status(500).json({ 
        error: `Coluna ${dateCol} não encontrada na view games.` 
      });
    }
    
    const countExpr = `CAST(COUNT(DISTINCT ${gameIdColEscaped}) AS DOUBLE)`;
    
    const sqlClean = `
      SELECT 
        CAST(EXTRACT(YEAR FROM CAST(${dateColEscaped} AS DATE)) AS INTEGER) AS season,
        ${countExpr} AS games
      FROM games_clean
      WHERE ${dateColEscaped} IS NOT NULL
        AND ${gameIdColEscaped} IS NOT NULL
        AND CAST(${dateColEscaped} AS DATE) IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM CAST(${dateColEscaped} AS DATE))
      ORDER BY season;
    `;
    const sqlRaw = `
      SELECT 
        CAST(EXTRACT(YEAR FROM CAST(${dateColEscaped} AS DATE)) AS INTEGER) AS season,
        ${countExpr} AS games
      FROM games
      WHERE ${dateColEscaped} IS NOT NULL
        AND ${gameIdColEscaped} IS NOT NULL
        AND CAST(${dateColEscaped} AS DATE) IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM CAST(${dateColEscaped} AS DATE))
      ORDER BY season;
    `;
    
    return queryWithFallback(sqlClean, sqlRaw, res);
  } catch (e) {
    console.error('Erro em /api/seasonal:', e.message);
    return res.json([]);
  }
});

app.get('/api/top_teams', async (req, res) => {
  try {
    const limit = req.query.limit || '10';
    
    const files = await findDataFiles();
    const lineScoreFile = files.find(f => /line_score\.csv$/i.test(f));
    
    if (!lineScoreFile) {
      const columns = await getAvailableColumns();
      
      const teamCol = columns.find(c => /team_name_home/i.test(c)) ||
                      columns.find(c => /team_abbreviation_home/i.test(c)) ||
                      columns.find(c => /team_name_away/i.test(c)) ||
                      columns.find(c => /team_abbreviation_away/i.test(c)) ||
                      null;
      
      const pointsCol = columns.find(c => /pts_home/i.test(c)) ||
                        columns.find(c => /pts_away/i.test(c)) ||
                        null;
      
      if (!teamCol || !pointsCol) {
        return res.json([]);
      }
    
      const teamColEscaped = escapeColumnName(teamCol);
      const pointsColEscaped = escapeColumnName(pointsCol);
      
      const hasHomeAway = /home|away/i.test(teamCol);
      
      let sqlClean, sqlRaw;
      
      if (hasHomeAway) {
        const teamHomeCol = columns.find(c => /team_name_home/i.test(c)) ||
                            columns.find(c => /team_abbreviation_home/i.test(c));
        const teamAwayCol = columns.find(c => /team_name_away/i.test(c)) ||
                            columns.find(c => /team_abbreviation_away/i.test(c));
        const ptsHomeCol = columns.find(c => /pts_home/i.test(c));
        const ptsAwayCol = columns.find(c => /pts_away/i.test(c));
        
        if (teamHomeCol && teamAwayCol && ptsHomeCol && ptsAwayCol) {
          const teamHomeEscaped = escapeColumnName(teamHomeCol);
          const teamAwayEscaped = escapeColumnName(teamAwayCol);
          const ptsHomeEscaped = escapeColumnName(ptsHomeCol);
          const ptsAwayEscaped = escapeColumnName(ptsAwayCol);
          
          sqlClean = `
            WITH home_stats AS (
              SELECT 
                COALESCE(CAST(${teamHomeEscaped} AS VARCHAR), 'Unknown') AS team,
                CAST(COALESCE(${ptsHomeEscaped}, 0) AS DOUBLE) AS points
              FROM games_clean
              WHERE ${teamHomeEscaped} IS NOT NULL AND ${ptsHomeEscaped} IS NOT NULL
            ),
            away_stats AS (
              SELECT 
                COALESCE(CAST(${teamAwayEscaped} AS VARCHAR), 'Unknown') AS team,
                CAST(COALESCE(${ptsAwayEscaped}, 0) AS DOUBLE) AS points
              FROM games_clean
              WHERE ${teamAwayEscaped} IS NOT NULL AND ${ptsAwayEscaped} IS NOT NULL
            ),
            all_stats AS (
              SELECT * FROM home_stats
              UNION ALL
              SELECT * FROM away_stats
            )
            SELECT 
              team AS player,
              CAST(SUM(points) AS DOUBLE) AS total_points,
              CAST(AVG(points) AS DOUBLE) AS avg_points,
              CAST(COUNT(*) AS DOUBLE) AS games
            FROM all_stats
            WHERE team != 'Unknown' AND points > 0
            GROUP BY team
            ORDER BY total_points DESC
            LIMIT ${limit};
          `;
          sqlRaw = `
            WITH home_stats AS (
              SELECT 
                COALESCE(CAST(${teamHomeEscaped} AS VARCHAR), 'Unknown') AS team,
                CAST(COALESCE(${ptsHomeEscaped}, 0) AS DOUBLE) AS points
              FROM games
              WHERE ${teamHomeEscaped} IS NOT NULL AND ${ptsHomeEscaped} IS NOT NULL
            ),
            away_stats AS (
              SELECT 
                COALESCE(CAST(${teamAwayEscaped} AS VARCHAR), 'Unknown') AS team,
                CAST(COALESCE(${ptsAwayEscaped}, 0) AS DOUBLE) AS points
              FROM games
              WHERE ${teamAwayEscaped} IS NOT NULL AND ${ptsAwayEscaped} IS NOT NULL
            ),
            all_stats AS (
              SELECT * FROM home_stats
              UNION ALL
              SELECT * FROM away_stats
            )
            SELECT 
              team AS player,
              CAST(SUM(points) AS DOUBLE) AS total_points,
              CAST(AVG(points) AS DOUBLE) AS avg_points,
              CAST(COUNT(*) AS DOUBLE) AS games
            FROM all_stats
            WHERE team != 'Unknown' AND points > 0
            GROUP BY team
            ORDER BY total_points DESC
            LIMIT ${limit};
          `;
        } else {
          return res.json([]);
        }
      } else {
        return res.json([]);
      }
      
      return queryWithFallback(sqlClean, sqlRaw, res);
    }
    
    const escaped = lineScoreFile.replace(/'/g, "''");
    
    try {
      const sql = `
        WITH line_score_data AS (
          SELECT * FROM read_csv_auto('${escaped}', header=true, auto_detect=true)
        ),
        home_stats AS (
          SELECT 
            COALESCE(CAST(team_abbreviation_home AS VARCHAR), CAST(team_city_name_home AS VARCHAR), 'Unknown') AS team,
            CAST(COALESCE(pts_home, 0) AS DOUBLE) AS points
          FROM line_score_data
          WHERE team_abbreviation_home IS NOT NULL 
            AND pts_home IS NOT NULL 
            AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL
            AND CAST(COALESCE(pts_home, 0) AS DOUBLE) > 0
        ),
        away_stats AS (
          SELECT 
            COALESCE(CAST(team_abbreviation_away AS VARCHAR), CAST(team_city_name_away AS VARCHAR), 'Unknown') AS team,
            CAST(COALESCE(pts_away, 0) AS DOUBLE) AS points
          FROM line_score_data
          WHERE team_abbreviation_away IS NOT NULL 
            AND pts_away IS NOT NULL 
            AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL
            AND CAST(COALESCE(pts_away, 0) AS DOUBLE) > 0
        ),
        all_stats AS (
          SELECT * FROM home_stats
          UNION ALL
          SELECT * FROM away_stats
        )
        SELECT 
          team AS player,
          CAST(SUM(points) AS DOUBLE) AS total_points,
          CAST(AVG(points) AS DOUBLE) AS avg_points,
          CAST(COUNT(*) AS DOUBLE) AS games
        FROM all_stats
        WHERE team != 'Unknown' AND points > 0
        GROUP BY team
        ORDER BY total_points DESC
        LIMIT ${limit};
      `;
      
      const result = await run(sql);
      return res.json(result || []);
    } catch (e) {
      console.error('Erro ao executar query para top times:', e.message);
      return res.json([]);
    }
  } catch (e) {
    console.error('Erro em /api/top_teams:', e.message);
    return res.json([]);
  }
});

app.get('/api/team_stats', async (req, res) => {
  try {
    const files = await findDataFiles();
    const lineScoreFile = files.find(f => /line_score\.csv$/i.test(f));
    
    if (!lineScoreFile) {
      return res.json([]);
    }
    
    const escaped = lineScoreFile.replace(/'/g, "''");
    
    try {
      const sql = `
        WITH line_score_data AS (
          SELECT * FROM read_csv_auto('${escaped}', header=true, auto_detect=true)
        ),
        home_stats AS (
          SELECT 
            COALESCE(CAST(team_abbreviation_home AS VARCHAR), CAST(team_city_name_home AS VARCHAR), 'Unknown') AS team,
            CAST(COALESCE(pts_home, 0) AS DOUBLE) AS points,
            game_id
          FROM line_score_data
          WHERE team_abbreviation_home IS NOT NULL 
            AND pts_home IS NOT NULL 
            AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL
            AND CAST(COALESCE(pts_home, 0) AS DOUBLE) > 0
        ),
        away_stats AS (
          SELECT 
            COALESCE(CAST(team_abbreviation_away AS VARCHAR), CAST(team_city_name_away AS VARCHAR), 'Unknown') AS team,
            CAST(COALESCE(pts_away, 0) AS DOUBLE) AS points,
            game_id
          FROM line_score_data
          WHERE pts_away IS NOT NULL 
            AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL
            AND CAST(COALESCE(pts_away, 0) AS DOUBLE) > 0
        ),
        all_stats AS (
          SELECT * FROM home_stats
          UNION ALL
          SELECT * FROM away_stats
        )
        SELECT 
          team,
          CAST(SUM(points) AS DOUBLE) AS total_points,
          CAST(AVG(points) AS DOUBLE) AS avg_points,
          CAST(COUNT(DISTINCT game_id) AS DOUBLE) AS games
        FROM all_stats
        WHERE team != 'Unknown' AND points > 0
        GROUP BY team
        ORDER BY total_points DESC;
      `;
      
      const result = await run(sql);
      return res.json(result || []);
    } catch (e) {
      console.error('Erro ao executar query para team_stats:', e.message);
      return res.json([]);
    }
  } catch (e) {
    console.error('Erro em /api/team_stats:', e.message);
    return res.json([]);
  }
});

app.get('/api/scatter', async (req, res) => {
  try {
    const limit = req.query.limit || '10000';
    
    const files = await findDataFiles();
    const gameFile = files.find(f => {
      const basename = path.basename(f).toLowerCase();
      return basename === 'game.csv';
    });
    
    if (!gameFile) {
      return res.json([]);
    }
    
    const escaped = gameFile.replace(/'/g, "''");
    
    const sql = `
      WITH game_data AS (
        SELECT * FROM read_csv_auto('${escaped}', header=true, auto_detect=true)
      ),
      home_stats AS (
        SELECT 
          CAST(COALESCE(pts_home, 0) AS DOUBLE) AS points,
          CAST(COALESCE(ast_home, 0) AS DOUBLE) AS assists,
          CAST(COALESCE(reb_home, 0) AS DOUBLE) AS rebounds,
          COALESCE(team_abbreviation_home, 'Unknown') AS team
        FROM game_data
        WHERE pts_home IS NOT NULL 
          AND ast_home IS NOT NULL 
          AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL
          AND TRY_CAST(ast_home AS DOUBLE) IS NOT NULL
          AND CAST(COALESCE(pts_home, 0) AS DOUBLE) > 0
      ),
      away_stats AS (
        SELECT 
          CAST(COALESCE(pts_away, 0) AS DOUBLE) AS points,
          CAST(COALESCE(ast_away, 0) AS DOUBLE) AS assists,
          CAST(COALESCE(reb_away, 0) AS DOUBLE) AS rebounds,
          COALESCE(team_abbreviation_away, 'Unknown') AS team
        FROM game_data
        WHERE pts_away IS NOT NULL 
          AND ast_away IS NOT NULL 
          AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL
          AND TRY_CAST(ast_away AS DOUBLE) IS NOT NULL
          AND CAST(COALESCE(pts_away, 0) AS DOUBLE) > 0
      ),
      all_stats AS (
        SELECT * FROM home_stats
        UNION ALL
        SELECT * FROM away_stats
      )
      SELECT 
        points,
        assists,
        rebounds,
        team
      FROM all_stats
      WHERE points > 0 AND assists >= 0
      ORDER BY RANDOM()
      LIMIT ${limit};
    `;
    
    const result = await run(sql);
    return res.json(toJSONSafe(result));
  } catch (e) {
    console.error('Erro em /api/scatter:', e.message);
    return res.status(500).json({ error: `Erro ao processar scatter plot: ${e.message}` });
  }
});

app.get('/api/quarters', async (req, res) => {
  try {
    const files = await findDataFiles();
    const lineScoreFile = files.find(f => /line_score\.csv$/i.test(path.basename(f)));
    
    if (!lineScoreFile) {
      return res.json([]);
    }
    
    const escaped = lineScoreFile.replace(/'/g, "''");
    
    const sql = `
      WITH line_score_data AS (
        SELECT * FROM read_csv_auto('${escaped}', header=true, auto_detect=true)
      ),
      home_quarters AS (
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr1_home, 0) AS DOUBLE) AS points,
          1 AS quarter
        FROM line_score_data
        WHERE pts_qtr1_home IS NOT NULL 
          AND TRY_CAST(pts_qtr1_home AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
        UNION ALL
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr2_home, 0) AS DOUBLE) AS points,
          2 AS quarter
        FROM line_score_data
        WHERE pts_qtr2_home IS NOT NULL 
          AND TRY_CAST(pts_qtr2_home AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
        UNION ALL
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr3_home, 0) AS DOUBLE) AS points,
          3 AS quarter
        FROM line_score_data
        WHERE pts_qtr3_home IS NOT NULL 
          AND TRY_CAST(pts_qtr3_home AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
        UNION ALL
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr4_home, 0) AS DOUBLE) AS points,
          4 AS quarter
        FROM line_score_data
        WHERE pts_qtr4_home IS NOT NULL 
          AND TRY_CAST(pts_qtr4_home AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
      ),
      away_quarters AS (
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr1_away, 0) AS DOUBLE) AS points,
          1 AS quarter
        FROM line_score_data
        WHERE pts_qtr1_away IS NOT NULL 
          AND TRY_CAST(pts_qtr1_away AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
        UNION ALL
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr2_away, 0) AS DOUBLE) AS points,
          2 AS quarter
        FROM line_score_data
        WHERE pts_qtr2_away IS NOT NULL 
          AND TRY_CAST(pts_qtr2_away AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
        UNION ALL
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr3_away, 0) AS DOUBLE) AS points,
          3 AS quarter
        FROM line_score_data
        WHERE pts_qtr3_away IS NOT NULL 
          AND TRY_CAST(pts_qtr3_away AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
        UNION ALL
        SELECT 
          EXTRACT(YEAR FROM CAST(game_date_est AS DATE)) AS year,
          CAST(COALESCE(pts_qtr4_away, 0) AS DOUBLE) AS points,
          4 AS quarter
        FROM line_score_data
        WHERE pts_qtr4_away IS NOT NULL 
          AND TRY_CAST(pts_qtr4_away AS DOUBLE) IS NOT NULL
          AND game_date_est IS NOT NULL
          AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
      ),
      all_quarters AS (
        SELECT * FROM home_quarters
        UNION ALL
        SELECT * FROM away_quarters
      ),
      year_quarters AS (
        SELECT 
          CAST(year AS INTEGER) AS year,
          quarter,
          CAST(AVG(points) AS DOUBLE) AS avg_points,
          CAST(COUNT(*) AS DOUBLE) AS games
        FROM all_quarters
        WHERE points >= 0 AND year IS NOT NULL
        GROUP BY year, quarter
        HAVING COUNT(*) > 10
      ),
      max_year AS (
        SELECT MAX(year) AS max_year FROM year_quarters
      )
      SELECT 
        yq.year,
        yq.quarter,
        yq.avg_points,
        yq.games
      FROM year_quarters yq
      CROSS JOIN max_year my
      WHERE yq.year >= my.max_year - 4
      ORDER BY yq.year, yq.quarter;
    `;

    const result = await run(sql);
    return res.json(toJSONSafe(result));
  } catch (e) {
    console.error('Erro em /api/quarters:', e.message);
    return res.status(500).json({ error: `Erro ao processar evolução de pontos por quarto: ${e.message}` });
  }
});

app.get('/api/shooting_efficiency', async (req, res) => {
  try {
    const files = await findDataFiles();
    const gameFile = files.find(f => /^game\.csv$/i.test(path.basename(f)));
    
    if (!gameFile) {
      return res.json([]);
    }
    
    const escaped = gameFile.replace(/'/g, "''");
    
    const sql = `
      WITH game_data AS (
        SELECT * FROM read_csv_auto('${escaped}', header=true, auto_detect=true)
      ),
      home_stats AS (
        SELECT 
          CAST(COALESCE(fg_pct_home, 0) AS DOUBLE) AS fg_pct,
          CAST(COALESCE(fg3_pct_home, 0) AS DOUBLE) AS fg3_pct,
          CAST(COALESCE(ft_pct_home, 0) AS DOUBLE) AS ft_pct,
          COALESCE(team_abbreviation_home, 'Unknown') AS team
        FROM game_data
        WHERE fg_pct_home IS NOT NULL 
          AND TRY_CAST(fg_pct_home AS DOUBLE) IS NOT NULL
          AND CAST(COALESCE(fg_pct_home, 0) AS DOUBLE) > 0
      ),
      away_stats AS (
        SELECT 
          CAST(COALESCE(fg_pct_away, 0) AS DOUBLE) AS fg_pct,
          CAST(COALESCE(fg3_pct_away, 0) AS DOUBLE) AS fg3_pct,
          CAST(COALESCE(ft_pct_away, 0) AS DOUBLE) AS ft_pct,
          COALESCE(team_abbreviation_away, 'Unknown') AS team
        FROM game_data
        WHERE fg_pct_away IS NOT NULL 
          AND TRY_CAST(fg_pct_away AS DOUBLE) IS NOT NULL
          AND CAST(COALESCE(fg_pct_away, 0) AS DOUBLE) > 0
      ),
      all_stats AS (
        SELECT * FROM home_stats
        UNION ALL
        SELECT * FROM away_stats
      )
      SELECT 
        team,
        CAST(AVG(fg_pct) AS DOUBLE) AS avg_fg_pct,
        CAST(AVG(fg3_pct) AS DOUBLE) AS avg_fg3_pct,
        CAST(AVG(ft_pct) AS DOUBLE) AS avg_ft_pct,
        CAST(COUNT(*) AS DOUBLE) AS games
      FROM all_stats
      WHERE team != 'Unknown'
      GROUP BY team
      HAVING COUNT(*) > 10
      ORDER BY avg_fg_pct DESC
      LIMIT 30;
    `;
    
    const result = await run(sql);
    return res.json(toJSONSafe(result));
  } catch (e) {
    console.error('Erro em /api/shooting_efficiency:', e.message);
    return res.status(500).json({ error: `Erro ao processar shooting_efficiency: ${e.message}` });
  }
});

app.get('/api/quality', async (req, res) => {
  try {
    const files = await findDataFiles();
    const lineScoreFile = files.find(f => /line_score\.csv$/i.test(path.basename(f)));
    const gameFile = files.find(f => /game\.csv$/i.test(path.basename(f)) && !/game_summary|game_info/i.test(path.basename(f)));
    
    if (!lineScoreFile && !gameFile) {
      return res.json({
        rows_total: 0,
        bad_points: 0,
        missing_date: 0,
        missing_team: 0,
        invalid_points: 0,
        avg_points: 0,
        valid_games: 0
      });
    }

    const sourceFile = lineScoreFile || gameFile;
    const escaped = sourceFile.replace(/'/g, "''");

    const sql = `
      WITH source_data AS (
        SELECT * FROM read_csv_auto('${escaped}', header=true, auto_detect=true)
      ),
      quality_check AS (
        SELECT
          CAST(COUNT(*) AS DOUBLE) AS rows_total,
          CAST(SUM(CASE 
            WHEN (pts_home IS NOT NULL AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL AND CAST(COALESCE(pts_home, 0) AS DOUBLE) < 0) 
              OR (pts_home IS NOT NULL AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL AND CAST(COALESCE(pts_home, 0) AS DOUBLE) > 200)
              OR (pts_away IS NOT NULL AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL AND CAST(COALESCE(pts_away, 0) AS DOUBLE) < 0)
              OR (pts_away IS NOT NULL AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL AND CAST(COALESCE(pts_away, 0) AS DOUBLE) > 200)
            THEN 1 ELSE 0 END) AS DOUBLE) AS bad_points,
          CAST(SUM(CASE 
            WHEN game_date_est IS NULL 
              OR TRY_CAST(game_date_est AS DATE) IS NULL
            THEN 1 ELSE 0 END) AS DOUBLE) AS missing_date,
          CAST(SUM(CASE 
            WHEN (team_abbreviation_home IS NULL AND team_city_name_home IS NULL)
              OR (team_abbreviation_away IS NULL AND team_city_name_away IS NULL)
            THEN 1 ELSE 0 END) AS DOUBLE) AS missing_team,
          CAST(SUM(CASE 
            WHEN (pts_home IS NOT NULL AND TRY_CAST(pts_home AS DOUBLE) IS NULL)
              OR (pts_away IS NOT NULL AND TRY_CAST(pts_away AS DOUBLE) IS NULL)
            THEN 1 ELSE 0 END) AS DOUBLE) AS invalid_points,
          CAST(AVG(CASE 
            WHEN pts_home IS NOT NULL AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL 
              AND CAST(COALESCE(pts_home, 0) AS DOUBLE) > 0 
              AND CAST(COALESCE(pts_home, 0) AS DOUBLE) <= 200
            THEN CAST(pts_home AS DOUBLE) ELSE NULL END) AS DOUBLE) AS avg_points_home,
          CAST(AVG(CASE 
            WHEN pts_away IS NOT NULL AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL 
              AND CAST(COALESCE(pts_away, 0) AS DOUBLE) > 0 
              AND CAST(COALESCE(pts_away, 0) AS DOUBLE) <= 200
            THEN CAST(pts_away AS DOUBLE) ELSE NULL END) AS DOUBLE) AS avg_points_away,
          CAST(SUM(CASE 
            WHEN game_date_est IS NOT NULL 
              AND TRY_CAST(game_date_est AS DATE) IS NOT NULL
              AND (team_abbreviation_home IS NOT NULL OR team_city_name_home IS NOT NULL)
              AND (team_abbreviation_away IS NOT NULL OR team_city_name_away IS NOT NULL)
              AND pts_home IS NOT NULL AND TRY_CAST(pts_home AS DOUBLE) IS NOT NULL
              AND pts_away IS NOT NULL AND TRY_CAST(pts_away AS DOUBLE) IS NOT NULL
              AND CAST(COALESCE(pts_home, 0) AS DOUBLE) > 0 
              AND CAST(COALESCE(pts_home, 0) AS DOUBLE) <= 200
              AND CAST(COALESCE(pts_away, 0) AS DOUBLE) > 0 
              AND CAST(COALESCE(pts_away, 0) AS DOUBLE) <= 200
            THEN 1 ELSE 0 END) AS DOUBLE) AS valid_games
        FROM source_data
      )
      SELECT
        rows_total,
        bad_points,
        missing_date,
        missing_team,
        invalid_points,
        CAST((COALESCE(avg_points_home, 0) + COALESCE(avg_points_away, 0)) / 2.0 AS DOUBLE) AS avg_points,
        valid_games
      FROM quality_check;
    `;

    const result = await run(sql);
    return res.json(toJSONSafe(result[0] || {}));
  } catch (e) {
    console.error('Erro em /api/quality:', e.message);
    return res.status(500).json({ error: `Erro ao processar qualidade dos dados: ${e.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
