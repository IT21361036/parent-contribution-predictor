"""Bootstrap the first admin account (there's no self-signup — every account,
including the first admin, is created server-side with the service-role key).

Usage (from app/backend, with the venv active and .env filled in):
    python scripts/create_admin.py <email> <password> "<full name>"
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.supabase_client import get_service_client  # noqa: E402


def main():
    if len(sys.argv) != 4:
        print('Usage: python scripts/create_admin.py <email> <password> "<full name>"')
        sys.exit(1)

    email, password, full_name = sys.argv[1:4]
    client = get_service_client()

    created = client.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        }
    )
    client.table("profiles").upsert(
        {"id": created.user.id, "role": "admin", "full_name": full_name, "email": email}
    ).execute()
    print(f"Admin account created: {email} ({created.user.id})")


if __name__ == "__main__":
    main()
