-- ---------------------------------------------------------------------------
-- 007 - mark demo accounts so they can be shown without being assignable
-- ---------------------------------------------------------------------------
-- The dispatch board needs a second technician column to be legible at all: a
-- board with one column is a list, and the conflict detection that is the whole
-- point of the board cannot be demonstrated with one technician. So the demo
-- seed creates a technician profile.
--
-- That profile then behaves like a real one everywhere, because profiles carry
-- no notion of being an example. It shows up in the service form's technician
-- dropdown, in complaint assignment, and in the accounts list, so real work can
-- be handed to somebody who does not exist and cannot be signed into.
--
-- This column lets the demo row be drawn on the board while staying out of every
-- list of people a job can be given to. The single source of truth for "can this
-- profile be assigned work" is activeTechnicians() in src/utils/technicians.ts,
-- which filters on this flag, so adding a new picker cannot forget to exclude it
-- the way a filter duplicated into each screen would.
--
-- Defaults to false, so this changes nothing for a real profile. Safe to run
-- more than once.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists is_demo boolean not null default false;

-- The seeded example row already exists wherever the seed ran before this
-- column did, so adding the column on its own leaves that row false and the
-- pickers carry on offering work to an account nobody can sign into: a fix that
-- looks deployed and does nothing. The seed now writes the flag, but re-running
-- it to fix a column that a migration should have backfilled is the wrong
-- dependency order. '.invalid' is reserved by RFC 2606, so this can only ever
-- match the seeded example and never a real person.
update profiles set is_demo = true where email = 'demo.tech@dispatch.invalid';

comment on column profiles.is_demo is
  'Example profile created to demonstrate a feature. Drawn on the dispatch board but never offered as somebody real work can be assigned to.';
