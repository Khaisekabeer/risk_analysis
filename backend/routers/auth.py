from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from services.auth_service import hash_password, verify_password, create_access_token, get_current_user
from models.all_models import User

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

class SignupRequest(BaseModel):
    username: str
    password: str
    role: str = "secops"
    display_name: str = ""

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "display_name": user.display_name or user.username
    }

@router.post("/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
        
    user = User(
        username=req.username,
        hashed_password=hash_password(req.password),
        role=req.role,
        display_name=req.display_name
    )
    db.add(user)
    db.commit()
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "display_name": user.display_name or user.username
    }

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "role": current_user.role,
        "display_name": current_user.display_name
    }
