-- Confirmed company configuration: 18 paid days (EL 6 + shared CL/SL 12), paternity 6 days.
-- Preserve historical requests; service calculation charges legacy SL against the shared CL pool.
UPDATE leave_types SET annual_quota=6, accrual='monthly', carry_forward_max=0, rule='0.50 day per completed month · April–March' WHERE code='EL';
UPDATE leave_types SET name='Casual & Sick Leave', annual_quota=12, accrual='quarterly', carry_forward_max=0, rule='Combined CL/SL: 3 days per quarter · 12 days per April–March year' WHERE code='CL';
UPDATE leave_types SET active=0, annual_quota=0, rule='Included in combined Casual & Sick Leave balance' WHERE code='SL';
UPDATE leave_types SET annual_quota=6, accrual='event', carry_forward_max=0, rule='Up to 6 working days' WHERE code='PL';
UPDATE policies SET content = replace(replace(replace(replace(content,
  '## 2. Entitlements (per calendar year)', '## 2. Entitlements (April 1 to March 31; 18 paid days total)'),
  '- Earned Leave (EL): 20 days, accrued monthly. Up to 5 unused days carry forward to the next year.', '- Earned Leave (EL): 6 days per year, earned at 0.50 day per completed month.'),
  E'- Casual Leave (CL): 12 days, credited in January (pro-rated for joiners). No carry forward.\n- Sick Leave (SL): 10 days. A medical certificate is required for absences longer than 3 days.', '- Casual & Sick Leave (CL/SL): one combined 12-day annual allowance, credited quarterly at 3 days per quarter, pro-rated for joiners. No carry forward.'),
  '- Paternity Leave: 15 days, to be availed within 6 months of birth or adoption.', '- Paternity Leave: up to 6 working days.'), version='4.0'
WHERE title='Leave Policy' AND version='3.2';
