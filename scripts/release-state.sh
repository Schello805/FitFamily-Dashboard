#!/usr/bin/env bash
# This file is installed root-owned beside the update worker.
activate_release() {
  local app_dir="$1" release="$2" operation="$3"
  [[ "$release" == "$app_dir/releases/"* && -d "$release" && -f "$release/.next/BUILD_ID" ]] || return 1
  [[ ! -e "$app_dir/current" || -L "$app_dir/current" ]] || return 1
  ln -s "$release" "$app_dir/.current-$operation"
  /usr/bin/python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$app_dir/.current-$operation" "$app_dir/current"
}

restore_release() {
  local app_dir="$1" previous="$2" operation="$3"
  [[ -d "$previous" && -f "$previous/.next/BUILD_ID" ]] || return 1
  ln -s "$previous" "$app_dir/.current-rollback-$operation"
  /usr/bin/python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$app_dir/.current-rollback-$operation" "$app_dir/current"
}
