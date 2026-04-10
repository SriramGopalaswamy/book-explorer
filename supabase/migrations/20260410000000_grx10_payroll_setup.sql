-- ===================================================================
-- GRX10 PAYROLL SETUP — APRIL 2026
-- ===================================================================
-- Sets up:
--   A) 6 master CTC components (Basic, HRA, Other Allowance,
--      Employer PF Contribution, Employee PF Deduction, Professional Tax)
--   B) 36 employee profiles + compensation structures effective 2026-04-01
--
-- Approach for new employees (not yet in auth.users):
--   • Temporarily disable on_auth_user_created and trg_auto_set_org_profiles
--     so we can insert auth.users + profiles atomically with all fields set.
--   • Re-enable triggers at the end of the block.
-- ===================================================================

DO $$
DECLARE
  c_org_id    CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  c_eff_date  CONSTANT DATE := '2026-04-01';

  v_admin_uid UUID;
  v_auth_id   UUID;
  v_prof_id   UUID;
  v_struct_id UUID;
  emp         RECORD;
BEGIN

  -- ─── 0. Resolve admin user (created_by for compensation records) ─────────
  SELECT ur.user_id
  INTO   v_admin_uid
  FROM   public.user_roles ur
  WHERE  ur.organization_id = c_org_id
    AND  ur.role = 'admin'
  ORDER BY ur.created_at
  LIMIT  1;

  -- ─── 1. Disable interfering triggers ─────────────────────────────────────
  -- on_auth_user_created: fires on auth.users INSERT and creates a bare profile
  --   row (no email / org_id). We insert profiles manually instead.
  -- trg_auto_set_org_profiles: tries to resolve org_id from auth.uid() which
  --   is NULL in migration context; we supply org_id explicitly.
  -- trg_audit_compensation_insert: calls auth.uid() (NULL here) to write audit
  --   log; disable to prevent a null actor_id error.
  ALTER TABLE auth.users                    DISABLE TRIGGER on_auth_user_created;
  ALTER TABLE public.profiles               DISABLE TRIGGER trg_auto_set_org_profiles;
  ALTER TABLE public.compensation_structures DISABLE TRIGGER trg_audit_compensation_insert;

  -- ─── 2. Upsert master CTC components ─────────────────────────────────────
  INSERT INTO public.master_ctc_components
    (organization_id, component_name, component_type,
     is_taxable, default_percentage_of_basic, display_order, is_active)
  VALUES
    (c_org_id, 'Basic',                    'earning',   true,  NULL, 1, true),
    (c_org_id, 'HRA',                      'earning',   false, NULL, 2, true),
    (c_org_id, 'Other Allowance',          'earning',   true,  NULL, 3, true),
    (c_org_id, 'Employer PF Contribution', 'earning',   false, NULL, 4, true),
    (c_org_id, 'Employee PF Deduction',    'deduction', false, NULL, 5, true),
    (c_org_id, 'Professional Tax',         'deduction', false, NULL, 6, true)
  ON CONFLICT (organization_id, component_name) DO UPDATE SET
    component_type              = EXCLUDED.component_type,
    is_taxable                  = EXCLUDED.is_taxable,
    default_percentage_of_basic = EXCLUDED.default_percentage_of_basic,
    display_order               = EXCLUDED.display_order,
    is_active                   = EXCLUDED.is_active,
    updated_at                  = now();

  -- ─── 3. Process each employee ─────────────────────────────────────────────
  -- Columns: email, full_name, annual_ctc, ann_basic, ann_hra, ann_other, ann_epf
  --          (all annual amounts = monthly × 12)
  --
  -- Notes on adjustments from payroll sheet:
  --   • madhu@grx10.com  : Other col in sheet shows 3,960 but Fixed=28,200 →
  --                         Other stored as 2,160 (= 28,200 − 18,600 − 7,440).
  --   • halesh@grx10.com : HRA 7,390 / Other 4,010 (as-is from sheet; sum=30,000 ✓).
  --   • arvind@grx10.com : Employer PF 4,923 stored as-is from sheet.
  --   • omkar@grx10.com  : Basic+HRA+Other = 40,119 vs Fixed 40,120 (₹1 rounding);
  --                         components stored as-is; CTC authoritative.

  FOR emp IN
    SELECT
      t.email,
      t.full_name,
      t.annual_ctc,
      t.ann_basic,
      t.ann_hra,
      t.ann_other,
      t.ann_epf
    FROM (VALUES
      -- ── high earners ─────────────────────────────────────────────────────
      ('sai@grx10.com',        'Lakshmi Sai',            2337144, 1449024,  579612,  286908,  21600),
      ('admin@grx10.com',      'Dilli Ram Nirola',         540000,  334800,  133920,   71280,      0),
      ('arvind@grx10.com',     'Arvind Singh',             794004,  455652,  182268,   97008,  59076),
      ('damo@grx10.com',       'Damodaran Shanmugam',    1800000, 1116000,  446400,  216000,  21600),
      ('yamuna@grx10.com',     'Yamuna',                 1500000,  930000,  372000,  198000,      0),
      ('azim@grx10.com',       'Azim Saya',              1200000,  707040,  282816,  188544,  21600),
      -- ── mid earners ──────────────────────────────────────────────────────
      ('omkar@grx10.com',      'Omkar',                   503040,  311880,  124752,   44796,  21600),
      ('rahul@grx10.com',      'Rahul',                   500004,  310008,  123996,   44400,  21600),
      ('aasim@grx10.com',      'Aasim Khaja',             600000,  372000,  148800,   79200,      0),
      ('yash@grx10.com',       'Yash Kumar Kishnani',     525600,  325872,  130344,   47784,  21600),
      ('viji@grx10.com',       'Viji Kumar',              650004,  389616,  155844,   82944,  21600),
      ('rajesh@grx10.com',     'Rajesh Kumar Rout',       450000,  279000,  111600,   25920,  33480),
      ('jayasankar@grx10.com', 'Jayasankar C',            360000,  223200,   89280,   25920,  21600),
      -- ── standard band (CTC 30,000 / month, 12% of 15k PF) ───────────────
      ('santosh@grx10.com',    'Santosh',                 360000,  223200,   89280,   25920,  21600),
      ('shruthi@grx10.com',    'Shruthi Gurje',           360000,  223200,   89280,   25920,  21600),
      ('manoj@grx10.com',      'Manoj Kumar',             360000,  223200,   89280,   25920,  21600),
      ('yousuf@grx10.com',     'Mohmmed Yousuf',          360000,  223200,   89280,   25920,  21600),
      ('manohar@grx10.com',    'Manohar K',               360000,  223200,   89280,   25920,  21600),
      ('madhu@grx10.com',      'Madhusudhan V',           360000,  223200,   89280,   25920,  21600),
      -- ── standard band (CTC 30,000 / month, opt out PF) ──────────────────
      ('yashwanth@grx10.com',  'Yashwanth',               360000,  223200,   89280,   47520,      0),
      ('sharon@grx10.com',     'Sharon Jacklin',           360000,  223200,   89280,   47520,      0),
      ('udhay@grx10.com',      'Udhay Kumar S',            360000,  223200,   89280,   47520,      0),
      ('halesh@grx10.com',     'Halesh KM',                360000,  223200,   88680,   48120,      0),
      ('luveesh@grx10.com',    'Luveesh K N',              360000,  223200,   89280,   47520,      0),
      ('allen@grx10.com',      'Allen',                    360000,  223200,   89280,   47520,      0),
      ('nayana@grx10.com',     'Nayana U O',               360000,  223200,   89280,   47520,      0),
      ('roopa@grx10.com',      'Roopa Biradar',            360000,  223200,   89280,   47520,      0),
      ('preethi@grx10.com',    'Preethi M',                360000,  223200,   89280,   47520,      0),
      ('sujay@grx10.com',      'Sujay K',                  360000,  223200,   89280,   47520,      0),
      ('nevitha@grx10.com',    'Nivetha Joys C',           360000,  223200,   89280,   47520,      0),
      ('manojs@grx10.com',     'Manoj S',                  360000,  223200,   89280,   47520,      0),
      -- ── lower bands ──────────────────────────────────────────────────────
      ('bhavya@grx10.com',     'Bhavya Sri Musale',        312000,  193440,   77376,   41184,      0),
      ('deepanshu@grx10.com',  'Deepanshu Singh',          300000,  186000,   74400,   39600,      0),
      ('monish@grx10.com',     'Monish K',                 240000,  135408,   54168,   28824,  21600),
      ('mahesh@grx10.com',     'Mahesh S',                 240000,  148800,   59520,   31680,      0),
      ('ravi@grx10.com',       'Ravindranath Reddy',       300000,  172608,   69048,   36744,  21600)
    ) AS t(email, full_name, annual_ctc, ann_basic, ann_hra, ann_other, ann_epf)
  LOOP

    -- 3a. Ensure auth user exists ──────────────────────────────────────────
    SELECT id INTO v_auth_id
    FROM   auth.users
    WHERE  lower(email) = emp.email;

    IF v_auth_id IS NULL THEN
      v_auth_id := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, aud, role,
        email, encrypted_password, email_confirmed_at,
        raw_user_meta_data, raw_app_meta_data,
        created_at, updated_at
      ) VALUES (
        v_auth_id,
        '00000000-0000-0000-0000-000000000000'::UUID,
        'authenticated',
        'authenticated',
        emp.email,
        '',   -- no password; MS365 OAuth is the login method
        now(),
        jsonb_build_object('full_name', emp.full_name),
        '{"provider": "azure", "providers": ["azure"]}'::JSONB,
        now(),
        now()
      );
    END IF;

    -- Use first resolved auth_id as fallback for created_by if no admin yet
    IF v_admin_uid IS NULL THEN
      v_admin_uid := v_auth_id;
    END IF;

    -- 3b. Ensure profile exists / update it ───────────────────────────────
    SELECT id INTO v_prof_id
    FROM   public.profiles
    WHERE  user_id = v_auth_id;

    IF v_prof_id IS NULL THEN
      INSERT INTO public.profiles (
        user_id, full_name, email,
        organization_id, current_state, status,
        created_at, updated_at
      ) VALUES (
        v_auth_id, emp.full_name, emp.email,
        c_org_id, 'active', 'active',
        now(), now()
      )
      RETURNING id INTO v_prof_id;
    ELSE
      UPDATE public.profiles
      SET
        full_name       = emp.full_name,
        email           = emp.email,
        organization_id = c_org_id,
        updated_at      = now()
      WHERE id = v_prof_id;
    END IF;

    -- 3c. Org membership ───────────────────────────────────────────────────
    INSERT INTO public.organization_members (organization_id, user_id)
    VALUES (c_org_id, v_auth_id)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    -- 3d. User role (employee) ─────────────────────────────────────────────
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (v_auth_id, 'employee', c_org_id)
    ON CONFLICT (user_id, role) DO UPDATE
      SET organization_id = EXCLUDED.organization_id;

    -- 3e. Compensation structure ───────────────────────────────────────────
    INSERT INTO public.compensation_structures (
      profile_id, organization_id, annual_ctc,
      effective_from, created_by,
      revision_reason, is_active
    ) VALUES (
      v_prof_id, c_org_id, emp.annual_ctc,
      c_eff_date, v_admin_uid,
      'Initial payroll setup Apr 2026', true
    )
    RETURNING id INTO v_struct_id;

    -- 3f. Compensation components (6 rows per employee) ────────────────────
    INSERT INTO public.compensation_components (
      compensation_structure_id,
      component_name, component_type,
      annual_amount, is_taxable, display_order
    ) VALUES
      (v_struct_id, 'Basic',                    'earning',   emp.ann_basic, true,  1),
      (v_struct_id, 'HRA',                      'earning',   emp.ann_hra,   false, 2),
      (v_struct_id, 'Other Allowance',          'earning',   emp.ann_other, true,  3),
      (v_struct_id, 'Employer PF Contribution', 'earning',   emp.ann_epf,   false, 4),
      (v_struct_id, 'Employee PF Deduction',    'deduction', emp.ann_epf,   false, 5),
      (v_struct_id, 'Professional Tax',         'deduction', 2400,          false, 6);

  END LOOP;

  -- ─── 4. Re-enable triggers ────────────────────────────────────────────────
  ALTER TABLE auth.users                    ENABLE TRIGGER on_auth_user_created;
  ALTER TABLE public.profiles               ENABLE TRIGGER trg_auto_set_org_profiles;
  ALTER TABLE public.compensation_structures ENABLE TRIGGER trg_audit_compensation_insert;

  RAISE NOTICE 'GRX10 payroll setup complete. 36 employees processed, effective %.', c_eff_date;

END $$;
