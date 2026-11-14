# Phase 2 functional walkthrough

Run `npm run dev`, then open http://127.0.0.1:5173. Everything happens on this computer and database. Start from your own blank data directory if desired; the app does not generate participants, projects or sample submissions.

## Create your group and draft

1. **Try Demo → Demo Login**. Manually create **Alex** (or any display name).
2. **Create New Project**. Set a final project deadline. Add two stages, a direct task in one, and a grouping task with two subtasks in the other. Save and copy the join code.
3. Select your project avatar and enter the workspace. Upload a pre-cut transparent PNG or choose a preset; no background removal runs.
4. Use the profile picker to create **Maya**, **Sam** and **Riley** manually. For each: **Join a Project**, enter the local code, select an avatar, join. There are now four simulated members sharing the same local data.
5. Switch to the creator Alex. **Open Whiteboard**. Expand a direct task, **Edit responsibility**, select one owner and a personal deadline, **Save draft change**. Repeat for each subtask. A grouping parent has no independent owner/completion count. Stages can run in parallel.
6. Until every current leaf has one owner/deadline and there are at least two members, **Confirm Initial Plan** is disabled. When ready, creator confirms once. The plan becomes Ongoing; initial members do not need to click Accept.

## Submit real evidence and review a specific version

7. Switch to a member assigned work. Click the right-side **Submit Your Part** prop. Select an assigned leaf. Add meaningful text, http(s) links, actual local files, or a combination. Click **Submit new version**.
8. The task becomes Pending Review. Its version, original files and submission time are saved. You cannot replace a pending version silently.
9. Switch to another member. **Whiteboard → Today → To Approve** opens Review Detail within the board. Download the original file, read text/links, and Approve or Request Changes. Request Changes requires a reason; the submitter cannot review their own version.
10. In the four-member team, **two of the three other members** approving completes that version. A first dissent does not veto two subsequent approvals. Two Request Changes votes instead make approval impossible and return the task for revisions.
11. Resubmit after requested changes. Version 2 has no carried-over votes; Version 1 and its files/votes remain visible in the version selector. If a before-deadline version is approved late, it is on time. An eventually approved replacement submitted after the deadline is late.

## Change an agreed responsibility or deadline

12. On an Ongoing task choose **Request task change**, edit the personal deadline or description, add a reason and propose. Your Yes vote is included automatically. The public request shows Before, Proposed, reason, proposer/time and named votes.
13. For four members, obtain **three Yes votes total**. Until then canonical work does not change. After majority, switch to the creator and **Apply approved change**. The resulting announcement appears at the top of the Whiteboard and the activity record is preserved.
14. For a transfer to another owner, both team majority **and the new owner's separate Accept this work** are required. Voting Yes alone is not target consent. The creator applies only after both are complete. Previous owner's versions remain historical; they do not complete the new owner's responsibility.
15. Structural changes use the same request UI: add/rename/retire a stage, add/retire a task, split a direct task into owned subtasks, or merge a group into a newly owned leaf. Retired work and evidence remain under History; current progress does not double-count it.

## Shared context, reminders and contribution

16. Click left-side **Files**. Choose a stage, add a real file, link or note. Download/edit it, or delete it as author/creator. This library never counts as a formal task submission or completion.
17. **Team Chat** opens one minimal thread. Send text, switch identity, observe unread count and author/time. Reading clears that profile's unread receipt. Decisions still occur on the Whiteboard.
18. Click a desk/member for current assigned leaves, approved progress and recent formal submissions. The selected local identity is Online; the others are Offline. No working-time tracking exists.
19. The notification bell is profile-specific. Due reminders catch up when the local app is opened/refreshed: once within the 24-hour window and once overdue, de-duplicated for that leaf/deadline/owner. They do not run while the process is stopped.
20. **Whiteboard → Contribution → Copy contribution report**. Each member shows assigned leaves, approved leaves, completion percentage and on-time rate (N/A with no completions). Team progress is the average of all member percentages, including zero-task members at 0%.

For the exact arithmetic example, create a separate project with two members: assign eight leaves to A and four to B, then approve two of A's and two of B's. The project must show **37.5%**. This scenario is also covered by automated API tests.

## Finish and verify persistence

21. The creator clicks **Finish Project** in Whiteboard Today and gives a reason. Requester starts with one Yes; the team-wide majority archives it. Reaching 100% alone never archives a project.
22. Archived rooms remain under Completed. Read work/version history, chat, shared files and Contribution; copy the report and download original evidence. All project-content writes, submissions, votes, assignments, resources and chat changes are blocked by the server.
23. Stop/restart with the same data directory. Profiles, project setup, votes, consent, versions, uploaded bytes, notes, chat, announcements, receipts and archive status remain. Use another empty DATA_DIR to demonstrate a fresh installation with zero seeded records.

The Phase 4 Whiteboard opens by clicking its entire room surface (or Enter/Space with keyboard focus). Use By stage / By member to browse responsibility and progress. The Latest task due date comes from the stage’s current work units. Team progress gives each member equal weight.
