# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from prepare_and_sync_materials import (
    ROOT,
    is_iwork,
    read_supabase_creds,
    rest,
    write_database_js,
)


def load_git_head_materials() -> list[dict]:
    raw = subprocess.check_output(["git", "show", "HEAD:database.js"], cwd=ROOT)
    text = raw.decode("utf-8")
    match = re.search(r"=\s*(\[.*\])\s*;?\s*$", text, re.S)
    if not match:
        raise RuntimeError("HEAD の database.js を読めませんでした")
    return json.loads(match.group(1))


def main() -> None:
    old_rows = load_git_head_materials()
    iwork = [r for r in old_rows if is_iwork(r.get("title", ""))]
    print(f"git HEAD の iワーク: {len(iwork)} 件")
    for row in iwork:
        print(f"  {row['id']} / {row['title']} 販売{row.get('price_retail')} 仕入{row.get('price_wholesale')}")

    db_path = ROOT / "database.js"
    current_text = db_path.read_text(encoding="utf-8")
    current = json.loads(re.search(r"=\s*(\[.*\])\s*;?\s*$", current_text, re.S).group(1))
    by_id = {row["id"]: row for row in current}
    added = 0
    for row in iwork:
        item = {
            "title": row["title"],
            "price_retail": int(row.get("price_retail") or 0),
            "id": row["id"],
            "price_wholesale": int(row.get("price_wholesale") or 0),
        }
        if row["id"] not in by_id:
            current.append(item)
            added += 1
        else:
            by_id[row["id"]].update(item)
    write_database_js(current, db_path)
    print(f"database.js に追加: {added} 件 / 合計 {len(current)} 件")

    url, key = read_supabase_creds()
    payload = [
        {
            "id": row["id"],
            "title": row["title"],
            "price_wholesale": int(row.get("price_wholesale") or 0),
            "price_retail": int(row.get("price_retail") or 0),
        }
        for row in iwork
    ]
    restored = rest(
        url,
        key,
        "POST",
        "/rest/v1/materials",
        payload,
        extra={"Prefer": "resolution=merge-duplicates,return=representation"},
    ) or []
    print(f"Supabase 復元: {len(restored)} 件")
    for row in restored:
        print(f"  ok {row['id']} / {row['title']}")


if __name__ == "__main__":
    main()
