"""Lesender Zugriff auf die Stud.IP JSON:API."""

import os
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT_DIR = Path(__file__).resolve().parent.parent


class AuthError(RuntimeError):
    pass


class StudIP:
    def __init__(self, base_url: str):
        load_dotenv(PROJECT_DIR / ".env")
        self.api = base_url.rstrip("/") + "/jsonapi.php/v1"
        self.session = requests.Session()
        self.session.headers["Accept"] = "application/vnd.api+json"

        user = os.getenv("STUDIP_USER", "").strip()
        password = os.getenv("STUDIP_PASSWORD", "").strip()
        cookie = os.getenv("STUDIP_COOKIE", "").strip()
        if user and password:
            self.session.auth = (user, password)
            self.auth_mode = "Basic Auth"
        elif cookie:
            self.session.cookies.set("Seminar_Session", cookie, domain=base_url.split("//")[1].split("/")[0])
            self.auth_mode = "Cookie"
        else:
            raise AuthError("Keine Zugangsdaten in .env gefunden (siehe .env.example).")

    def get(self, path: str, **params) -> dict:
        r = self.session.get(f"{self.api}{path}", params=params, timeout=30)
        if r.status_code in (401, 403):
            raise AuthError(f"Anmeldung abgelehnt ({r.status_code}, Modus: {self.auth_mode}).")
        r.raise_for_status()
        return r.json()

    def get_all(self, path: str) -> list[dict]:
        """Alle Einträge einer paginierten Liste."""
        items, offset, limit = [], 0, 100
        while True:
            data = self.get(path, **{"page[offset]": offset, "page[limit]": limit})
            items.extend(data.get("data", []))
            total = data.get("meta", {}).get("page", {}).get("total", len(items))
            offset += limit
            if offset >= total or not data.get("data"):
                return items

    def me(self) -> dict:
        return self.get("/users/me")["data"]

    def my_courses(self) -> list[dict]:
        return self.get_all(f"/users/{self.me()['id']}/courses")

    def course_title(self, course_id: str) -> str:
        return self.get(f"/courses/{course_id}")["data"]["attributes"]["title"]

    def folders(self, course_id: str) -> dict[str, str]:
        return {f["id"]: f["attributes"]["name"] for f in self.get_all(f"/courses/{course_id}/folders")}

    def file_refs(self, course_id: str) -> list[dict]:
        return self.get_all(f"/courses/{course_id}/file-refs")

    def download(self, file_ref_id: str, target: Path) -> None:
        with self.session.get(f"{self.api}/file-refs/{file_ref_id}/content", stream=True, timeout=120) as r:
            r.raise_for_status()
            tmp = target.with_suffix(target.suffix + ".part")
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(65536):
                    f.write(chunk)
            tmp.replace(target)
