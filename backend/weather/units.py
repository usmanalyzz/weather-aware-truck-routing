"""Unit conversions. Open-Meteo is queried in mph/inches, but these keep the provider swappable and tested."""

KMH_PER_MPH = 1.609344
MM_PER_INCH = 25.4


def kmh_to_mph(kmh: float) -> float:
    return kmh / KMH_PER_MPH


def ms_to_mph(ms: float) -> float:
    return ms * 3600 / 1000 / KMH_PER_MPH


def mm_to_in(mm: float) -> float:
    return mm / MM_PER_INCH


def cm_to_in(cm: float) -> float:
    return cm * 10 / MM_PER_INCH


def lb_to_kg(lb: float) -> float:
    return lb * 0.45359237
