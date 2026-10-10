from enum import IntEnum


class RiskLevel(IntEnum):
    """Ordered risk scale. The integer value is also the score used for average risk."""

    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()
