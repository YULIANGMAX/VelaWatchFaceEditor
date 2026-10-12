import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

const packageJsonPath = path.join(srcDir, 'package.json');
const tauriConfPath = path.join(srcDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(srcDir, 'src-tauri', 'Cargo.toml');

function readPackageJson() {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`找不到 package.json: ${packageJsonPath}`);
  }
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function syncVersion(specifiedVersion) {
  const pkg = readPackageJson();
  let version = specifiedVersion || pkg.version;

  if (specifiedVersion && specifiedVersion !== pkg.version) {
    pkg.version = specifiedVersion;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`[version-sync] 已更新 package.json 版本为 v${specifiedVersion}`);
  }

  if (!version) {
    throw new Error('未在 package.json 中找到版本号');
  }

  let updatedCount = 0;

  // 1. 同步 tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const original = fs.readFileSync(tauriConfPath, 'utf8');
    let updated = original.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`);
    updated = updated.replace(/"title"\s*:\s*"Vela 表盘编辑器[^"]*"/, `"title": "Vela 表盘编辑器 v${version}"`);
    if (updated !== original) {
      fs.writeFileSync(tauriConfPath, updated, 'utf8');
      updatedCount += 1;
    }
  }

  // 2. 同步 Cargo.toml
  if (fs.existsSync(cargoTomlPath)) {
    const original = fs.readFileSync(cargoTomlPath, 'utf8');
    const updated = original.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${version}"`);
    if (updated !== original) {
      fs.writeFileSync(cargoTomlPath, updated, 'utf8');
      updatedCount += 1;
    }
  }

  if (updatedCount > 0) {
    console.log(`[version-sync] 已将版本号 v${version} 同步至 tauri.conf.json 和 Cargo.toml`);
  }
}

const inputVersion = process.argv[2];
syncVersion(inputVersion);
