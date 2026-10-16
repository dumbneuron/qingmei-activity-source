# Activity protocol subset

Group: `2026110100`; main: `2026110101`; shop: `2026110102`; happy: `2026110104`.

`OperateRequest`: id field 1, cmd field 2. `OperateReply`: id 1, cmd 2, activity 3.
Main activity body is field 121, happy body 120, shop body 102.

| Action | Target | cmd | Request oneof | Reply oneof |
|---|---|---:|---|---|
| shop view | main | 55 | 160 empty | 160 |
| hire list | main | 56 | 161 duration_id=field 1 | 161 |
| hire | main | 57 | 162 selection=field 1 | 162 |
| recipes | main | 58 | 163 empty | 163 |
| cashier claim | main | 59 | 164 empty | 164 |
| make | main | 62 | 167 packed item_uids=field 1 | 167 |
| ranking | main | 66 | 171 empty in this subset | 171 |
| revenue record | main | 67 | 172 empty in this subset | 172 |
| buy | shop | 1 | 101 goods_id=1,count=2 | 101 |
| prepare happy share | happy | 70 | absent: id + cmd only | 153 |
| happy reward claim | happy | 71 | absent: id + cmd only | 154 |
| daily happy | happy | 74 | absent: id + cmd only | 157 |

Ranking page selection and historical day queries are outside this minimal request subset.
The reply decoders retain ranking pagination and record-day fields.

Hire selection fields: candidate_type 1, duration_id 2, friend_gid 3.
Only candidate_type=0 and one ordinary friend per submission are implemented.
Shifts 1/2/3 mean 4/12/24 hours; ticket costs 40/130/270.
Hire result status=1 is the verified success status; the employee identity and term must also match.
Employee fields: uid 3, start_at 4, end_at 5, cost 6, specialty_id 7, specialty_name 8, user 11.

Make submits bag-stack UIDs, not item IDs. Reply fields: made_cups 1, listed_cups 2, used_fruits 3.

Happy summary: happy_value field 2, milestones field 5. Milestone statuses: 1 not ready, 2 claimable, 3 claimed.
Prepare-share response field 1 is native share material. It may contain identity-related values in real integrations;
the runtime only returns a sanitized receipt to the Web layer and discards that material.
Milestone claiming sends no stage ID; reply fields: claimed_step_ids 1, awards 2.

Upgrade submission is deliberately absent: no success exchange was available to verify it.
No login, WebSocket gateway, envelope encryption, credentials or raw capture records are included.
