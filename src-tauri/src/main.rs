#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    if !harbor_lib::run_project_tools() { harbor_lib::run(); }
}
