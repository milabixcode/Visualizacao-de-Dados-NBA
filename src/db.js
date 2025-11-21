import duckdb from 'duckdb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'nba.duckdb');

const db = new duckdb.Database(dbPath, { access_mode: 'READ_WRITE' });

db.run("SET GLOBAL decimal_separator='.';");
db.run("SET GLOBAL thousands_separator='';");
db.run("SET GLOBAL date_style='ISO';");
db.run("SET GLOBAL preserve_insertion_order=false;");

export async function run(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export async function exec(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

