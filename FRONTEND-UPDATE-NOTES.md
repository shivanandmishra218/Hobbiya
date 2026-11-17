# Hobbiyaa frontend update notes

This ZIP is an iteration of the existing Supabase-backed project, not a production-ready public launch build.

## Included in this iteration
- Preserved the existing homepage redesign and current project pages.
- Added a compact “Find people like you” discovery panel to the feed, linking to the existing people-browse page.
- Added feed time filters: Any time, Today, This weekend, and Upcoming.
- Improved Quick Post form guidance and venue suggestions while still allowing manually typed locations.
- Made hobby, meeting spot, future date/time, additional people needed, and description required.
- Added limits/validation for participant count and description length.
- Clarified that “additional people needed” excludes the host; feed capacity text shows joined participants and remaining spots.
- Added a public-meetup safety reminder.

## Important
- The app still uses Supabase for authentication, database, and storage. No migration to a laptop-hosted backend has been done.
- This ZIP has not been tested against your live Supabase project or deployed to production. Verify schema/RLS, storage bucket policies, auth redirects, browser/mobile behavior, and all user flows before public launch.
- Venue suggestions are simple starting-point suggestions, not a live verified venue directory. The existing geocoding flow remains separate.
- Online status/last seen, robust hobby matching, post-event follow-up, and native Android/iOS apps are not implemented as complete backend-backed features in this iteration.
