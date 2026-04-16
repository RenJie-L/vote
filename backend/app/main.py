from __future__ import annotations

import os
import sqlite3
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import (
    APIRouter,
    FastAPI,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .db import connect

conn: sqlite3.Connection | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global conn
    conn = connect()
    yield
    if conn is not None:
        conn.close()
        conn = None


app = FastAPI(title="Vote API", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    msg = detail if isinstance(detail, str) else str(detail)
    return JSONResponse(status_code=exc.status_code, content={"error": msg})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def voter_session_middleware(request: Request, call_next):
    voter_sid = request.cookies.get("voter_sid")
    created = False
    if not voter_sid:
        voter_sid = str(uuid4())
        created = True
    request.state.voter_session = voter_sid
    response = await call_next(request)
    if created:
        max_age = 60 * 60 * 24 * 400
        response.set_cookie(
            key="voter_sid",
            value=voter_sid,
            httponly=True,
            samesite="lax",
            max_age=max_age,
            path="/",
        )
    return response


def get_conn() -> sqlite3.Connection:
    if conn is None:
        raise RuntimeError("Database not initialized")
    return conn


def get_voter_session(request: Request) -> str:
    sid = getattr(request.state, "voter_session", None)
    if not sid:
        raise HTTPException(status_code=500, detail="会话异常")
    return sid


api = APIRouter(prefix="/api")


class CreatePollBody(BaseModel):
    title: str = Field(min_length=1)
    options: list[str]


class VoteBody(BaseModel):
    optionId: str = Field(min_length=1)


@api.get("/polls")
def list_polls():
    c = get_conn()
    cur = c.execute(
        """
        SELECT p.id, p.title, p.created_at AS createdAt, COUNT(o.id) AS optionCount
        FROM polls p
        LEFT JOIN poll_options o ON o.poll_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
        """
    )
    rows = cur.fetchall()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "createdAt": r["createdAt"],
            "optionCount": r["optionCount"],
        }
        for r in rows
    ]


@api.post("/polls", status_code=status.HTTP_201_CREATED)
def create_poll(body: CreatePollBody):
    title = body.title.strip()
    raw_opts = body.options
    if not title:
        raise HTTPException(status_code=400, detail="标题不能为空")
    if len(raw_opts) < 2:
        raise HTTPException(status_code=400, detail="至少需要两个选项")
    options = [str(o).strip() for o in raw_opts if str(o).strip()]
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="每个选项不能为空")

    poll_id = str(uuid4())
    created_at = int(time.time() * 1000)
    c = get_conn()

    try:
        with c:
            c.execute(
                "INSERT INTO polls (id, title, created_at) VALUES (?, ?, ?)",
                (poll_id, title, created_at),
            )
            for i, label in enumerate(options):
                c.execute(
                    """
                    INSERT INTO poll_options (id, poll_id, label, sort_order)
                    VALUES (?, ?, ?, ?)
                    """,
                    (str(uuid4()), poll_id, label, i),
                )
    except sqlite3.Error:
        raise HTTPException(status_code=500, detail="创建失败") from None

    return {"id": poll_id}


@api.get("/polls/{poll_id}")
def get_poll(poll_id: str, request: Request):
    voter_session = get_voter_session(request)
    c = get_conn()

    row = c.execute(
        "SELECT id, title, created_at AS createdAt FROM polls WHERE id = ?",
        (poll_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="议题不存在")

    option_rows = c.execute(
        """
        SELECT o.id, o.label, o.sort_order AS sortOrder
        FROM poll_options o
        WHERE o.poll_id = ?
        ORDER BY o.sort_order ASC, o.id ASC
        """,
        (poll_id,),
    ).fetchall()

    count_rows = c.execute(
        """
        SELECT option_id AS optionId, COUNT(*) AS c
        FROM votes
        WHERE poll_id = ?
        GROUP BY option_id
        """,
        (poll_id,),
    ).fetchall()

    count_map = {r["optionId"]: r["c"] for r in count_rows}
    total_votes = sum(count_map.values())

    existing = c.execute(
        """
        SELECT option_id AS optionId FROM votes
        WHERE poll_id = ? AND voter_session = ?
        """,
        (poll_id, voter_session),
    ).fetchone()

    options_out = []
    for o in option_rows:
        oid = o["id"]
        vote_count = count_map.get(oid, 0)
        percent = (
            0.0
            if total_votes == 0
            else round((vote_count * 10000) / total_votes) / 100
        )
        options_out.append(
            {
                "id": oid,
                "label": o["label"],
                "sortOrder": o["sortOrder"],
                "voteCount": vote_count,
                "percent": percent,
            }
        )

    return {
        "id": row["id"],
        "title": row["title"],
        "createdAt": row["createdAt"],
        "options": options_out,
        "hasVoted": existing is not None,
        "votedOptionId": existing["optionId"] if existing else None,
        "totalVotes": total_votes,
    }


@api.post("/polls/{poll_id}/votes", status_code=status.HTTP_204_NO_CONTENT)
def vote(poll_id: str, body: VoteBody, request: Request):
    voter_session = get_voter_session(request)
    option_id = body.optionId.strip()
    if not option_id:
        raise HTTPException(status_code=400, detail="请选择选项")

    c = get_conn()
    if (
        c.execute("SELECT id FROM polls WHERE id = ?", (poll_id,)).fetchone()
        is None
    ):
        raise HTTPException(status_code=404, detail="议题不存在")

    if (
        c.execute(
            "SELECT id FROM poll_options WHERE id = ? AND poll_id = ?",
            (option_id, poll_id),
        ).fetchone()
        is None
    ):
        raise HTTPException(status_code=400, detail="选项无效")

    vote_id = str(uuid4())
    try:
        c.execute(
            """
            INSERT INTO votes (id, poll_id, option_id, voter_session)
            VALUES (?, ?, ?, ?)
            """,
            (vote_id, poll_id, option_id, voter_session),
        )
        c.commit()
    except sqlite3.IntegrityError as e:
        c.rollback()
        msg = str(e).upper()
        if "UNIQUE" in msg:
            raise HTTPException(status_code=409, detail="您已经投过票") from None
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


app.include_router(api)


def run() -> None:
    port = int(os.environ.get("PORT", "3000"))
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    run()
