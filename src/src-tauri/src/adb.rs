use serde::{Deserialize, Serialize};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AdbDevice {
    pub id: String,
    pub state: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AdbDeployOptions {
    pub device_id: Option<String>,
    pub pkg_id: String,
    pub bin_path: Option<String>,
    pub bin_bytes: Option<Vec<u8>>,
    pub clean_cache: bool,
    pub rebuild_index: bool,
    pub reboot: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AdbDeployResult {
    pub success: bool,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

fn create_cmd(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

#[tauri::command]
pub fn adb_check_environment() -> Result<String, String> {
    let output = create_cmd("adb")
        .arg("version")
        .output()
        .map_err(|e| format!("未找到 adb 命令或无法执行: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn adb_list_devices() -> Result<Vec<AdbDevice>, String> {
    let output = create_cmd("adb")
        .arg("devices")
        .output()
        .map_err(|e| format!("执行 adb devices 失败: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut list = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("List of devices") || line.starts_with("* daemon") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            list.push(AdbDevice {
                id: parts[0].to_string(),
                state: parts[1].to_string(),
            });
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn adb_deploy_watchface(options: AdbDeployOptions) -> Result<AdbDeployResult, String> {
    let mut logs = Vec::new();

    let (temp_file, bin_file_path) = if let Some(bytes) = options.bin_bytes {
        let temp_path = std::env::temp_dir().join(format!(
            "wf_deploy_{}.bin",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));
        std::fs::write(&temp_path, bytes).map_err(|e| format!("写入临时文件失败: {}", e))?;
        (Some(temp_path.clone()), temp_path.to_string_lossy().to_string())
    } else if let Some(path) = options.bin_path {
        if !std::path::Path::new(&path).exists() {
            return Ok(AdbDeployResult {
                success: false,
                logs,
                error: Some(format!("指定的 resource.bin 文件不存在: {}", path)),
            });
        }
        (None, path)
    } else {
        return Ok(AdbDeployResult {
            success: false,
            logs,
            error: Some("未提供 resource.bin 数据或路径".to_string()),
        });
    };

    let run_adb = |args: &[&str]| -> Result<String, String> {
        let mut cmd = create_cmd("adb");
        if let Some(ref dev) = options.device_id {
            if !dev.trim().is_empty() {
                cmd.arg("-s").arg(dev);
            }
        }
        for arg in args {
            cmd.arg(arg);
        }
        let out = cmd.output().map_err(|e| format!("执行 adb {:?} 失败: {}", args, e))?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if !out.status.success() {
            let err_msg = if !stderr.is_empty() { stderr } else { stdout.clone() };
            Err(format!("adb 命令失败 ({}): {}", out.status, err_msg))
        } else {
            Ok(stdout)
        }
    };

    let remote_market_dir = format!("/data/app/watchface/market/{}", options.pkg_id);

    // 1. 清理旧解压目录
    if options.clean_cache {
        logs.push(format!("正在清理旧解压目录与缓存: {}", remote_market_dir));
        let _ = run_adb(&["shell", &format!("rm -rf {}", remote_market_dir)]);
    }

    // 2. 创建目录
    logs.push(format!("创建表盘目标目录: {}", remote_market_dir));
    if let Err(e) = run_adb(&["shell", &format!("mkdir -p {}", remote_market_dir)]) {
        cleanup_temp(temp_file);
        return Ok(AdbDeployResult {
            success: false,
            logs,
            error: Some(format!("创建远程目录失败: {}", e)),
        });
    }

    // 3. 推送文件
    logs.push(format!("推送 resource.bin 至模拟器 {}/ ...", remote_market_dir));
    match run_adb(&["push", &bin_file_path, &format!("{}/", remote_market_dir)]) {
        Ok(res) => {
            if !res.is_empty() {
                logs.push(format!("推送结果: {}", res));
            }
        }
        Err(e) => {
            cleanup_temp(temp_file);
            return Ok(AdbDeployResult {
                success: false,
                logs,
                error: Some(format!("推送 resource.bin 失败: {}", e)),
            });
        }
    }

    // 4. 重建索引
    if options.rebuild_index {
        logs.push("清理索引缓存: /data/app/watchface/watchface_list.json".to_string());
        let _ = run_adb(&["shell", "rm -f /data/app/watchface/watchface_list.json"]);
    }

    // 5. 重启设备
    if options.reboot {
        logs.push("触发模拟器系统重启 (reboot)...".to_string());
        let _ = run_adb(&["shell", "reboot"]);
    }

    cleanup_temp(temp_file);
    logs.push("表盘已成功部署到模拟器！".to_string());

    Ok(AdbDeployResult {
        success: true,
        logs,
        error: None,
    })
}

fn cleanup_temp(path: Option<std::path::PathBuf>) {
    if let Some(p) = path {
        let _ = std::fs::remove_file(p);
    }
}
