"""Contracts produced by the fantasy scoring engine."""

from typing import Literal, Self

from pydantic import Field, model_validator

from contracts.match import Contract


class LedgerEntry(Contract):
    """One change to a player's fantasy points.

    Entries that can still change (clean sheet, goals conceded, bonus) are
    `provisional` and keep a stable `id`: a later entry with the same id replaces
    the earlier one, and its `running_total` already reflects the replacement.
    At full time every provisional entry is issued again with `provisional` false.
    """

    kind: Literal["ledger_entry"] = "ledger_entry"
    id: str
    match_id: str
    player_id: str
    minute: int
    delta: int
    running_total: int
    rule_id: str
    reason: str
    source_event_ids: list[int] = Field(min_length=1)
    provisional: bool


class FantasySquad(Contract):
    """Eleven players from the match; the captain's points count twice."""

    players: list[str] = Field(min_length=11, max_length=11)
    captain_id: str
    vice_captain_id: str

    @model_validator(mode="after")
    def _captains_in_squad(self) -> Self:
        if len(set(self.players)) != len(self.players):
            raise ValueError("squad players must be unique")
        if self.captain_id == self.vice_captain_id:
            raise ValueError("captain and vice-captain must differ")
        if not {self.captain_id, self.vice_captain_id} <= set(self.players):
            raise ValueError("captain and vice-captain must be in the squad")
        return self
