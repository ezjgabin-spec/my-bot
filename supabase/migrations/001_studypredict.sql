-- Run once in the Supabase SQL editor, or with `supabase db push`.
create extension if not exists pgcrypto;
create table public.subjects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), created_at timestamptz not null default now(), unique(user_id,name), unique(id,user_id)
);
create table public.school_exams (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 subject_id uuid not null, name text not null check(length(name) between 1 and 160), exam_date date,
 created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(subject_id,user_id) references public.subjects(id,user_id)
);
create table public.study_materials (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 filename text not null, mime_type text not null, storage_path text, extracted_text text not null check(length(extracted_text) between 40 and 100000),
 created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.practice_tests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 exam_id uuid not null, material_id uuid not null,
 difficulty text not null check(difficulty in ('Easy','Medium','Hard','Teacher-Level')),
 format text not null check(format in ('multiple_choice','short_answer','math','mixed')),
 question_count integer not null check(question_count in (10,15,20,30,40)),
 time_limit_minutes integer check(time_limit_minutes between 1 and 240), topics text[] not null,
 created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(exam_id,user_id) references public.school_exams(id,user_id),
 foreign key(material_id,user_id) references public.study_materials(id,user_id)
);
create table public.questions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 test_id uuid not null, position integer not null,
 kind text not null check(kind in ('multiple_choice','short_answer','math')),
 prompt text not null, topic text not null, options jsonb,
 max_points numeric not null check(max_points > 0 and max_points <= 20),
 answer_key text not null, explanation text not null, rubric text not null,
 unique(test_id,position), unique(id,user_id), foreign key(test_id,user_id) references public.practice_tests(id,user_id) on delete cascade
);
create table public.practice_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 test_id uuid not null, exam_id uuid not null,
 status text not null default 'in_progress' check(status in ('in_progress','grading','completed')),
 responses jsonb not null default '{}'::jsonb, flags uuid[] not null default '{}',
 score numeric check(score between 0 and 100), earned_points numeric, possible_points numeric,
 started_at timestamptz not null default now(), deadline_at timestamptz, submitted_at timestamptz, completed_at timestamptz,
 time_spent_seconds integer, grading_token uuid, grading_started_at timestamptz,
 unique(id,user_id), foreign key(test_id,user_id) references public.practice_tests(id,user_id),
 foreign key(exam_id,user_id) references public.school_exams(id,user_id)
);
create unique index one_active_attempt on public.practice_attempts(user_id,test_id) where status in ('in_progress','grading');
create table public.answers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 attempt_id uuid not null, question_id uuid not null, response text not null,
 points numeric not null check(points >= 0), max_points numeric not null check(max_points > 0), feedback text not null, topic text not null,
 check(points <= max_points), unique(attempt_id,question_id),
 foreign key(attempt_id,user_id) references public.practice_attempts(id,user_id),
 foreign key(question_id,user_id) references public.questions(id,user_id)
);
create table public.predictions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 exam_id uuid not null, attempt_id uuid not null unique, subject text not null,
 predicted numeric not null check(predicted between 0 and 100), lower numeric not null, upper numeric not null,
 baseline numeric not null, adjustment numeric not null,
 confidence text not null check(confidence in ('low','moderate','higher')), sample_size integer not null,
 explanation text not null, features jsonb not null, model_version text not null,
 created_at timestamptz not null default now(), check(lower >= 0 and upper <= 100 and lower <= predicted and predicted <= upper),
 foreign key(exam_id,user_id) references public.school_exams(id,user_id),
 foreign key(attempt_id,user_id) references public.practice_attempts(id,user_id)
);
create table public.actual_school_grades (
 exam_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 grade numeric not null check(grade between 0 and 100), recorded_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(exam_id,user_id) references public.school_exams(id,user_id)
);
create table public.ai_jobs (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token uuid not null, started_at timestamptz not null default now()
);

-- All database access goes through authenticated, owner-filtered server endpoints.
-- No direct browser access to answer keys, grades, or forecasts; service role is server-only.
do $$ declare t text; begin
 foreach t in array array['subjects','school_exams','study_materials','practice_tests','questions','practice_attempts','answers','predictions','actual_school_grades','ai_jobs'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant all on public.%I to service_role', t);
  execute format('create index %I on public.%I (user_id)', t || '_owner_idx', t);
 end loop;
end $$;
create index attempts_exam_idx on public.practice_attempts(exam_id,completed_at);
create index predictions_exam_idx on public.predictions(exam_id,created_at);

create function public.immutable_prediction() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Prediction snapshots cannot be updated'; end $$;
create trigger immutable_prediction before update on public.predictions for each row execute function public.immutable_prediction();

create function public.save_generated_test(p_user uuid, p_test jsonb, p_questions jsonb) returns uuid
language plpgsql set search_path = public as $$
declare tid uuid; begin
 perform 1 from school_exams where id=(p_test->>'exam_id')::uuid and user_id=p_user for update;
 if not found then raise exception 'Exam not found'; end if;
 if exists(select 1 from actual_school_grades where exam_id=(p_test->>'exam_id')::uuid) then raise exception 'This exam already has an actual grade. Create a new exam for further practice.'; end if;
 if jsonb_array_length(p_questions) <> (p_test->>'question_count')::integer then raise exception 'Question count mismatch'; end if;
 insert into practice_tests(user_id,exam_id,material_id,difficulty,format,question_count,time_limit_minutes,topics)
 values(p_user,(p_test->>'exam_id')::uuid,(p_test->>'material_id')::uuid,p_test->>'difficulty',p_test->>'format',(p_test->>'question_count')::integer,(p_test->>'time_limit_minutes')::integer,array(select jsonb_array_elements_text(p_test->'topics'))) returning id into tid;
 insert into questions(user_id,test_id,position,kind,prompt,topic,options,max_points,answer_key,explanation,rubric)
 select p_user,tid,(q->>'position')::integer,q->>'kind',q->>'prompt',q->>'topic',q->'options',(q->>'max_points')::numeric,q->>'answer_key',q->>'explanation',q->>'rubric' from jsonb_array_elements(p_questions) q;
 return tid;
end $$;

create function public.start_attempt(p_user uuid,p_test uuid) returns uuid language plpgsql set search_path=public as $$
declare t practice_tests; a practice_attempts; aid uuid; begin
 select * into t from practice_tests where id=p_test and user_id=p_user;
 if not found then raise exception 'Test not found'; end if;
 perform 1 from school_exams where id=t.exam_id and user_id=p_user for update;
 select * into a from practice_attempts where test_id=p_test and user_id=p_user and status in ('in_progress','grading');
 if found then return a.id; end if;
 if exists(select 1 from actual_school_grades where exam_id=t.exam_id) then raise exception 'This exam already has an actual grade. Create a new exam for further practice.'; end if;
 insert into practice_attempts(user_id,test_id,exam_id,deadline_at) values(p_user,t.id,t.exam_id,case when t.time_limit_minutes is null then null else now()+make_interval(mins=>t.time_limit_minutes) end) returning id into aid;
 return aid;
end $$;

create function public.save_attempt_answers(p_user uuid,p_attempt uuid,p_responses jsonb,p_flags uuid[]) returns void language plpgsql set search_path=public as $$
begin
 update practice_attempts set responses=p_responses, flags=p_flags
 where id=p_attempt and user_id=p_user and status='in_progress' and (deadline_at is null or deadline_at>now());
 if not found then raise exception 'Answers cannot be saved: time expired or attempt is already submitted.'; end if;
end $$;

create function public.claim_submission(p_user uuid,p_attempt uuid,p_token uuid) returns public.practice_attempts language plpgsql set search_path=public as $$
declare a practice_attempts; begin
 select * into a from practice_attempts where id=p_attempt and user_id=p_user for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.status='completed' then return a; end if;
 if a.status='grading' and a.grading_started_at>now()-interval '5 minutes' then raise exception 'Grading is already running. Refresh in a moment.'; end if;
 update practice_attempts set status='grading', grading_token=p_token, grading_started_at=now(), submitted_at=coalesce(submitted_at,now()) where id=a.id returning * into a;
 return a;
end $$;

create function public.finish_submission(p_user uuid,p_attempt uuid,p_token uuid,p_answers jsonb,p_prediction jsonb) returns void language plpgsql set search_path=public as $$
declare a practice_attempts; earned numeric; possible numeric; begin
 select * into a from practice_attempts where id=p_attempt and user_id=p_user for update;
 if a.status='completed' then return; end if;
 if a.id is null or a.status<>'grading' or a.grading_token is distinct from p_token then raise exception 'Submission lock expired; reload and retry.'; end if;
 perform 1 from school_exams where id=a.exam_id for update;
 if jsonb_array_length(p_answers) <> (select count(*) from questions where test_id=a.test_id) then raise exception 'Incomplete grading'; end if;
 insert into answers(user_id,attempt_id,question_id,response,points,max_points,feedback,topic)
 select p_user,a.id,(r->>'question_id')::uuid,r->>'response',(r->>'points')::numeric,(r->>'max_points')::numeric,r->>'feedback',r->>'topic' from jsonb_array_elements(p_answers) r;
 select sum(points),sum(max_points) into earned,possible from answers where attempt_id=a.id;
 update practice_attempts set status='completed',score=round(earned/possible*100,2),earned_points=earned,possible_points=possible,completed_at=now(),
 time_spent_seconds=greatest(0,extract(epoch from (least(a.submitted_at,coalesce(a.deadline_at,a.submitted_at))-a.started_at))::integer),grading_token=null where id=a.id;
 if p_prediction is not null and not exists(select 1 from actual_school_grades where exam_id=a.exam_id) then
 insert into predictions(user_id,exam_id,attempt_id,subject,predicted,lower,upper,baseline,adjustment,confidence,sample_size,explanation,features,model_version)
 values(p_user,a.exam_id,a.id,p_prediction->>'subject',(p_prediction->>'predicted')::numeric,(p_prediction->>'lower')::numeric,(p_prediction->>'upper')::numeric,(p_prediction->>'baseline')::numeric,(p_prediction->>'adjustment')::numeric,p_prediction->>'confidence',(p_prediction->>'sample_size')::integer,p_prediction->>'explanation',p_prediction->'features',p_prediction->>'model_version');
 end if;
end $$;

create function public.record_actual_grade(p_user uuid,p_exam uuid,p_grade numeric) returns void language plpgsql set search_path=public as $$
begin
 perform 1 from school_exams where id=p_exam and user_id=p_user for update;
 if not found then raise exception 'Exam not found'; end if;
 insert into actual_school_grades(exam_id,user_id,grade) values(p_exam,p_user,p_grade)
 on conflict(exam_id) do update set grade=excluded.grade,updated_at=now();
end $$;

create function public.claim_ai_job(p_user uuid,p_token uuid) returns boolean language plpgsql set search_path=public as $$
begin
 insert into ai_jobs(user_id,token) values(p_user,p_token) on conflict(user_id) do update set token=excluded.token,started_at=now() where ai_jobs.started_at < now()-interval '5 minutes';
 return found;
end $$;

do $$ declare fn regprocedure; begin
 for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('save_generated_test','start_attempt','save_attempt_answers','claim_submission','finish_submission','record_actual_grade','claim_ai_job') loop
  execute format('revoke execute on function %s from public, anon, authenticated',fn);
  execute format('grant execute on function %s to service_role',fn);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('study-materials','study-materials',false,3145728,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'])
on conflict(id) do nothing;
-- No storage policies for anon/authenticated: uploads and downloads go through the authorized server.
