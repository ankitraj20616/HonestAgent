/* Dummy data for the prototype. One story runs through every screen:
   project acme-billing, task T-0012 "Add password reset API", Claude asks "new table or Redis?". */
const D = {};

D.projects = [
  {id:'acme-billing', path:'~/OFFICE/acme-billing', remote:'github.com/ankit/acme-billing', branch:'main', checks:['uv run ruff check .','uv run pytest -q','uv run pyright']},
  {id:'saarthi', path:'~/OFFICE/saarthi', remote:'github.com/ankitraj20616/Saarthi', branch:'main', checks:['uv run ruff check .','uv run pytest','uv run pyright']},
  {id:'clinic-portal', path:'~/OFFICE/clinic-portal', remote:'github.com/ankit/clinic-portal', branch:'main', checks:['npm run lint','npm test','npm run build']},
];

D.agents = [
  {id:'claude', name:'Claude Code', short:'Claude', note:'Logged in · default', ok:true},
  {id:'codex', name:'Codex', short:'Codex', note:'Installed · not logged in', ok:false},
  {id:'gemini', name:'Gemini CLI', short:'Gemini', note:'Logged in', ok:true},
];

/* g = status group (needs / working / todo / done), k = row dot (ask, review, fail, work, todo) */
D.tasks = [
  {id:'T-0012', repo:'acme-billing', g:'needs', k:'ask', agent:'Claude', title:'Add password reset API', line:'Claude has a question: new table or Redis? · 3 min ago', action:'Answer', to:'question', stage:'Running · needs_input'},
  {id:'T-0031', repo:'saarthi', g:'needs', k:'ask', agent:'Codex', title:'Upgrade Alembic to 1.14', line:'Codex wants to run a command: uv lock --upgrade · 9 min ago', action:'Answer', to:'safetyAsk', stage:'Running · needs_input'},
  {id:'T-0009', repo:'acme-billing', g:'needs', k:'review', agent:'Claude', title:'Rate-limit the login endpoint', line:'Ready for your review · all checks passed', action:'Review', to:'check', stage:'Review'},
  {id:'T-0027', repo:'saarthi', g:'needs', k:'fail', agent:'Codex', title:'Event replay after reconnect', line:'Codex could not fix the failing test in 3 tries', action:'Decide', to:'fixLimit', stage:'Failed · fix 3/3'},
  {id:'T-0018', repo:'acme-billing', g:'working', k:'work', agent:'Claude', title:'Invoice PDF export with line-item totals', line:'Claude is writing tests · 12 min', to:'work', stage:'Running'},
  {id:'T-0044', repo:'clinic-portal', g:'working', k:'work', agent:'Gemini', title:'Appointment reminders by SMS', line:'Gemini is changing 4 files · 7 min', to:'work', stage:'Running'},
  {id:'T-0021', repo:'acme-billing', g:'working', k:'work', agent:'Claude + Gemini', title:'Faster invoice search', line:'Side by side · Claude and Gemini both working · 9 min', to:'raceRunning', stage:'Running · race'},
  {id:'T-0033', repo:'acme-billing', g:'todo', k:'todo', agent:'', title:'Export invoices as CSV', line:'Goal ready · from Jira ACME-151', action:'Start', to:'todoTask', stage:'Ready'},
  {id:'T-0015', repo:'acme-billing', g:'todo', k:'todo', agent:'', title:'Cache tax rates per region', line:'Researching · Claude is reading the code', to:'research', stage:'Research'},
  {id:'T-0024', repo:'saarthi', g:'todo', k:'todo', agent:'', title:'Show task cost on cards', line:'Goal ready', action:'Start', to:'todoTask', stage:'Ready'},
  {id:'T-0047', repo:'clinic-portal', g:'todo', k:'todo', agent:'', title:'Dark mode for the settings page', line:'Idea · no goal yet', to:'todoTask', stage:'Inbox'},
  {id:'T-0006', repo:'acme-billing', g:'done', title:'Fix invoice rounding', pr:'PR #112', when:'Tue'},
  {id:'T-0008', repo:'acme-billing', g:'done', title:'Add audit log table', pr:'PR #109', when:'Mon'},
  {id:'T-0039', repo:'clinic-portal', g:'done', title:'Fix timezone in calendar', pr:'PR #41', when:'Mon'},
];

D.task = {
  id:'T-0012', title:'Add password reset API', repo:'acme-billing', agent:'Claude',
  branch:'saarthi/T-0012-add-password-reset-api',
  copy:'~/.local/share/saarthi/worktrees/acme-billing/T-0012',
  ticket:'ACME-142',
  goal:'Users can reset a forgotten password by email. Today they must email support and wait (ticket #4821).',
  done:[
    'Asking for a reset sends an email with a single-use link',
    'The link expires after 30 minutes',
    'A used or expired link is refused (410)',
    'An unknown email gets the same answer (202), so no one can probe for accounts',
    'Tests cover all of the above',
  ],
};

/* "What changed" groups on Check and ship (was Change Story chapters) */
D.groups = [
  {title:'New API endpoints', why:'Ask for a reset link, then set a new password. Tokens are hashed before saving.', stat:'+58 −4', flag:'Login code', file:'app/auth/routes.py',
   diff:'app/auth/routes.py\n- @router.post("/forgot-password")\n+ @router.post("/password-reset", status_code=202)\n+ def password_reset(body: ResetRequest, db: DbSession):\n+ @router.post("/password-reset/confirm")'},
  {title:'Database change', why:'New table for reset tokens: user, token hash, expiry, used time.', stat:'+31', flag:'Migration', file:'migrations/versions/0042_password_reset_tokens.py',
   diff:'migrations/versions/0042_password_reset_tokens.py\n+ op.create_table("password_reset_tokens",\n+   sa.Column("token_hash", sa.String(64)), …)\n+ op.create_index("ix_token_hash", …)'},
  {title:'Settings', why:'Reset links expire after 30 minutes.', stat:'+2', flag:'', file:'app/settings.py',
   diff:'app/settings.py\n+ RESET_TOKEN_TTL_MINUTES: int = 30'},
  {title:'Tests', why:'7 new tests: happy path, expired, reused, unknown email, weak password, email text.', stat:'+80', flag:'', file:'tests/auth/test_password_reset.py',
   diff:'tests/auth/test_password_reset.py\n+ def test_token_expires_after_30_min(…)\n+ def test_used_token_returns_410(…)'},
];

D.lessons = [
  {t:'Use timezone-aware UTC times in expiry checks', from:'Add password reset API', when:'today', fresh:true},
  {t:'Freeze time in tests, never sleep', from:'Fix flaky login test', when:'10 Oct'},
  {t:'Use cursor pagination on (created_at, id)', from:'Add pagination to /invoices', when:'7 Oct'},
  {t:'All mail goes through app/mail.send_mail', from:'Sign-up email verification', when:'3 Oct'},
];

D.playbooks = [
  {t:'Plan first, then build', d:'Write a plan, wait for my OK, then build in small steps.', src:'Built-in · Claude'},
  {t:'Fix a bug, test first', d:'Write a failing test that shows the bug, then fix it.', src:'This project · Claude'},
  {t:'Small steps, one commit each', d:'Keep each change small and easy to review.', src:'All projects'},
  {t:'Review for security', d:'Read-only. List risks in the changes; change nothing.', src:'Built-in · Codex'},
  {t:'Write tests for this module', d:'Add missing tests without changing behaviour.', src:'Built-in · Codex'},
  {t:'Refactor safely', d:'Change structure, not behaviour. Tests must stay green.', src:'Built-in · Claude'},
];

D.tickets = [
  {key:'ACME-142', t:'Add password reset API', s:'In Review · linked to T-0012', linked:'question'},
  {key:'ACME-151', t:'Export invoices as CSV', s:'To Do · High', start:true},
  {key:'ACME-153', t:'Tax rounding error', s:'To Do · Bug · Highest', start:true},
  {key:'ACME-147', t:'Invoice PDF footer', s:'In Progress · linked to T-0018', linked:'work'},
  {key:'ACME-150', t:'Rate limit login', s:'In Review · linked to T-0009', linked:'check'},
  {key:'ACME-155', t:'Show VAT number on invoices', s:'To Do · Medium', start:true},
];

/* Plan doc shown in Docs and Plan review */
D.planMd = `# Plan · Add password reset API

## Steps
1. Add a \`password_reset_tokens\` table (Alembic migration 0042).
2. Add \`app/auth/reset.py\`: make, hash, store and check tokens.
3. Replace the \`/forgot-password\` stub with \`POST /password-reset\` and \`POST /password-reset/confirm\`.
4. Send the link with \`app/mail.send_mail\` (template \`password_reset\`).
5. Tests: happy path, expired, reused, unknown email, weak password, email text.

## Risks
- Timing leak when comparing token hashes: use \`hmac.compare_digest\`.
- Local time vs UTC in expiry checks: use timezone-aware UTC.

## Open question
- Store tokens in a new table, or in Redis? (Asking the owner.)
`;

/* Files in the task's copy of acme-billing. s: A added, M changed, '' unchanged. Lines start with + (added), - (removed) or a space. */
D.files = {
'app/__init__.py':{s:'',lines:` `},
'app/auth/__init__.py':{s:'',lines:` `},
'app/auth/reset.py':{s:'A',why:'New file. Makes, stores and checks reset tokens. Tokens are hashed (SHA-256) before saving, and a link works only once and only for 30 minutes.',lines:`+import hashlib
+import hmac
+import secrets
+from datetime import datetime, timedelta, timezone
+
+from sqlalchemy.orm import Session
+
+from app.mail import send_mail
+from app.models import PasswordResetToken, User
+from app.settings import settings
+
+
+class TokenInvalid(Exception):
+    pass
+
+
+def hash_token(token: str) -> str:
+    return hashlib.sha256(token.encode()).hexdigest()
+
+
+def request_reset(email: str, db: Session) -> None:
+    user = db.query(User).filter_by(email=email).first()
+    if user is None:
+        return  # same 202 answer, no user enumeration
+    token = secrets.token_urlsafe(32)
+    expires = datetime.now(timezone.utc) + timedelta(
+        minutes=settings.RESET_TOKEN_TTL_MINUTES
+    )
+    db.add(PasswordResetToken(
+        user_id=user.id, token_hash=hash_token(token), expires_at=expires,
+    ))
+    db.commit()
+    send_mail(user.email, "password_reset", {"token": token})
+
+
+def confirm_reset(token: str, new_password: str, db: Session) -> None:
+    row = db.query(PasswordResetToken).filter_by(
+        token_hash=hash_token(token)).first()
+    if row is None or row.used_at or row.expires_at < datetime.now(timezone.utc):
+        raise TokenInvalid()
+    row.used_at = datetime.now(timezone.utc)
+    row.user.set_password(new_password)
+    db.commit()`},
'app/auth/routes.py':{s:'M',why:'Replaced the old "email support" stub with two endpoints: ask for a reset link, and confirm with a new password. The login route is unchanged.',lines:` from fastapi import APIRouter, HTTPException
+from app.auth import reset
 from app.auth.schemas import LoginRequest, TokenResponse
 from app.db import DbSession
 
 router = APIRouter(prefix="/auth")
 
 
 @router.post("/login", response_model=TokenResponse)
 def login(body: LoginRequest, db: DbSession):
     return login_user(body.email, body.password, db)
 
 
-# TODO: real password reset (ticket #4821)
-@router.post("/forgot-password")
-def forgot_password():
-    raise HTTPException(501, "Email support to reset your password")
+@router.post("/password-reset", status_code=202)
+def password_reset(body: reset.ResetRequest, db: DbSession):
+    """Send a reset link. Same answer for unknown emails."""
+    reset.request_reset(body.email, db)
+    return {"status": "ok"}
+
+
+@router.post("/password-reset/confirm")
+def password_reset_confirm(body: reset.ResetConfirm, db: DbSession):
+    try:
+        reset.confirm_reset(body.token, body.new_password, db)
+    except reset.TokenInvalid:
+        raise HTTPException(410, "This reset link is used or expired")
+    return {"status": "ok"}`},
'app/auth/schemas.py':{s:'',lines:` from pydantic import BaseModel, EmailStr
 
 
 class LoginRequest(BaseModel):
     email: EmailStr
     password: str
 
 
 class TokenResponse(BaseModel):
     access_token: str
     token_type: str = "bearer"`},
'app/models/password_reset.py':{s:'A',why:'The new table you chose when Claude asked "new table or Redis?". One row per reset link.',lines:`+from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
+from sqlalchemy.orm import relationship
+
+from app.db import Base
+
+
+class PasswordResetToken(Base):
+    __tablename__ = "password_reset_tokens"
+
+    id = Column(Integer, primary_key=True)
+    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"))
+    token_hash = Column(String(64), index=True, nullable=False)
+    expires_at = Column(DateTime(timezone=True), nullable=False)
+    used_at = Column(DateTime(timezone=True))
+
+    user = relationship("User")`},
'app/models/user.py':{s:'',lines:` from sqlalchemy import Column, Integer, String
 
 from app.db import Base
 from app.auth.security import hash_password
 
 
 class User(Base):
     __tablename__ = "users"
 
     id = Column(Integer, primary_key=True)
     email = Column(String, unique=True, nullable=False)
     password_hash = Column(String, nullable=False)
 
     def set_password(self, raw: str) -> None:
         self.password_hash = hash_password(raw)`},
'app/mail.py':{s:'',lines:` from app.settings import settings
 
 
 def send_mail(to: str, template: str, ctx: dict) -> None:
     """All mail goes through here (DKIM on mail.acme.dev)."""
     body = render(f"email/{template}.txt", ctx)
     smtp_send(settings.SMTP_HOST, to, body)`},
'app/settings.py':{s:'M',why:'One new setting so the expiry time is not hard-coded.',lines:` from pydantic_settings import BaseSettings
 
 
 class Settings(BaseSettings):
     DATABASE_URL: str
     SMTP_HOST: str
     SESSION_TTL_MINUTES: int = 60
+    RESET_TOKEN_TTL_MINUTES: int = 30
 
 
 settings = Settings()`},
'migrations/versions/0042_password_reset_tokens.py':{s:'A',why:'Creates the new table with an index on token_hash. Runs with "alembic upgrade head".',lines:`+"""password reset tokens
+
+Revision ID: 0042
+Revises: 0041
+"""
+import sqlalchemy as sa
+from alembic import op
+
+
+def upgrade():
+    op.create_table(
+        "password_reset_tokens",
+        sa.Column("id", sa.Integer, primary_key=True),
+        sa.Column("user_id", sa.ForeignKey("users.id", ondelete="CASCADE")),
+        sa.Column("token_hash", sa.String(64), nullable=False),
+        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
+        sa.Column("used_at", sa.DateTime(timezone=True)),
+    )
+    op.create_index("ix_token_hash", "password_reset_tokens", ["token_hash"])
+
+
+def downgrade():
+    op.drop_table("password_reset_tokens")`},
'tests/auth/test_password_reset.py':{s:'A',why:'7 new tests: happy path, expired link, reused link, unknown email, weak password and the email text.',lines:`+from datetime import timedelta
+
+
+def test_reset_sends_email(client, user, outbox):
+    r = client.post("/auth/password-reset", json={"email": user.email})
+    assert r.status_code == 202
+    assert len(outbox) == 1
+
+
+def test_unknown_email_same_answer(client, outbox):
+    r = client.post("/auth/password-reset", json={"email": "nobody@acme.dev"})
+    assert r.status_code == 202
+    assert outbox == []
+
+
+def test_token_expires_after_30_min(client, user, freezer):
+    token = request_token(client, user.email)
+    freezer.tick(timedelta(minutes=31))
+    r = client.post("/auth/password-reset/confirm", json={"token": token, "new_password": "N3w-pass!"})
+    assert r.status_code == 410
+
+
+def test_used_token_returns_410(client, user):
+    token = request_token(client, user.email)
+    confirm(client, token)
+    assert confirm(client, token).status_code == 410`},
'tests/auth/conftest.py':{s:'',lines:` import pytest
 
 
 @pytest.fixture
 def user(db):
     return make_user(db, email="ankit@acme.dev")`},
'pyproject.toml':{s:'',lines:` [project]
 name = "acme-billing"
 requires-python = ">=3.12"
 dependencies = ["fastapi", "sqlalchemy", "alembic", "pydantic-settings"]`},
'README.md':{s:'',lines:` # acme-billing
 
 Billing API for Acme. Run with \`uv run uvicorn app.main:app\`.`},
};
