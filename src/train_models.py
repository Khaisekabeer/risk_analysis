import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import precision_recall_curve, auc, brier_score_loss, mean_squared_error, mean_absolute_error, r2_score
import joblib

from config import PROCESSED_DATA_DIR, MODEL_DIR

def train_incident_model():
    print("--- Training Incident Likelihood Model (XGBoost) ---")
    X_train = pd.read_csv(PROCESSED_DATA_DIR / "X_train.csv")
    X_test = pd.read_csv(PROCESSED_DATA_DIR / "X_test.csv")
    y_train = pd.read_csv(PROCESSED_DATA_DIR / "y_inc_train.csv").values.ravel()
    y_test = pd.read_csv(PROCESSED_DATA_DIR / "y_inc_test.csv").values.ravel()
    
    # Calculate scale_pos_weight to handle class imbalance (rare incidents)
    neg_count = (y_train == 0).sum()
    pos_count = (y_train == 1).sum()
    scale_weight = neg_count / pos_count if pos_count > 0 else 1.0
    
    # Base XGBoost Classifier
    base_clf = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_weight,
        eval_metric='logloss',
        random_state=42
    )
    
    # Probability Calibration using Isotonic Regression
    # Extremely important for Risk Quantification so 0.1 actually means 10% chance
    calibrated_clf = CalibratedClassifierCV(estimator=base_clf, method='isotonic', cv=3)
    calibrated_clf.fit(X_train, y_train)
    
    # Evaluation
    probs = calibrated_clf.predict_proba(X_test)[:, 1]
    
    # PR-AUC
    precision, recall, _ = precision_recall_curve(y_test, probs)
    pr_auc = auc(recall, precision)
    
    # Brier Score (measures calibration)
    brier = brier_score_loss(y_test, probs)
    
    # Classification Metrics (using 0.5 threshold)
    preds = (probs > 0.5).astype(int)
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    acc = accuracy_score(y_test, preds)
    prec = precision_score(y_test, preds, zero_division=0)
    rec = recall_score(y_test, preds, zero_division=0)
    f1 = f1_score(y_test, preds, zero_division=0)
    
    print(f"Incident Model Metrics -> PR-AUC: {pr_auc:.4f} | Brier Score: {brier:.4f}")
    print(f"Classification Metrics -> Accuracy: {acc:.4f} | Precision: {prec:.4f} | Recall: {rec:.4f} | F1-Score: {f1:.4f}")
    
    joblib.dump(calibrated_clf, MODEL_DIR / "incident_model_xgb.pkl")
    return calibrated_clf

def train_impact_model():
    print("\n--- Training Financial Impact Model (XGBoost Regressor) ---")
    X_train = pd.read_csv(PROCESSED_DATA_DIR / "X_train.csv")
    X_test = pd.read_csv(PROCESSED_DATA_DIR / "X_test.csv")
    y_train = pd.read_csv(PROCESSED_DATA_DIR / "y_loss_train.csv").values.ravel()
    y_test = pd.read_csv(PROCESSED_DATA_DIR / "y_loss_test.csv").values.ravel()
    
    # We only train the impact model on assets that ACTUALLY had an incident (loss > 0)
    train_incident_mask = y_train > 0
    test_incident_mask = y_test > 0
    
    X_train_impact = X_train[train_incident_mask]
    y_train_impact = y_train[train_incident_mask]
    X_test_impact = X_test[test_incident_mask]
    y_test_impact = y_test[test_incident_mask]
    
    # XGBoost Regressor
    # Objective 'reg:tweedie' is great for skewed, heavy-tailed financial loss data
    reg = xgb.XGBRegressor(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.1,
        objective='reg:tweedie',
        tweedie_variance_power=1.5,
        random_state=42
    )
    
    reg.fit(X_train_impact, y_train_impact)
    
    # Evaluation
    preds = reg.predict(X_test_impact)
    
    mae = mean_absolute_error(y_test_impact, preds)
    rmse = np.sqrt(mean_squared_error(y_test_impact, preds))
    r2 = r2_score(y_test_impact, preds)
    
    print(f"Impact Model Metrics -> MAE: INR {mae:,.2f} | RMSE: INR {rmse:,.2f} | R-squared: {r2:.4f}")
    
    joblib.dump(reg, MODEL_DIR / "impact_model_xgb.pkl")
    return reg

if __name__ == "__main__":
    train_incident_model()
    train_impact_model()
