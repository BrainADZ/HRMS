import { test, expect } from '@playwright/test';
import { boot, credentials } from '../helpers.js';
let ctx;
test.beforeAll(async()=>{ctx=await boot({serveClient:true});});
test.afterAll(async()=>{await ctx?.close();});
test('old verification link opens normal attendance',async({page})=>{
  await page.route('**/api/auth/celebrations',route=>route.fulfill({json:{today:'2026-11-02',birthdays:[],holidays:[]}}));
  const login=await page.request.post(ctx.base+'/auth/login',{
    headers:{'X-Requested-With':'hrms'},
    data:{...credentials(ctx.base,'rajiv.malhotra@brainadz.com'),password:'Brainadz@2026'},
  });
  expect(login.ok()).toBe(true);
  await page.goto(ctx.base.replace(/\/api$/,'')+'/attendance?tab=verification');
  await expect(page.getByRole('tab',{name:'Attendance Verification',exact:true})).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Today',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Monthly Register',exact:true}).click();
  await expect(page.getByRole('region',{name:'Attendance code meanings'})).toBeVisible();
});
