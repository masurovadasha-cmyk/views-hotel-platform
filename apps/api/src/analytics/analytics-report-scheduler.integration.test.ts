import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {AnalyticsReportService} from "./analytics-report.service";
import {AnalyticsReportWorkerService} from "./analytics-report-worker.service";
import {AnalyticsReportScheduleService} from "./analytics-report-schedule.service";
import {AnalyticsReportSchedulerWorkerService} from "./analytics-report-scheduler-worker.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";

const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"report-scheduler-manager"
};

const HOST={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000004",
  membershipId:"30000000-0000-4000-8000-000000000004",
  requestId:"report-scheduler-host"
};

const db=new DatabaseService();
const dashboard=new AnalyticsDashboardService(db);
const reports=new AnalyticsReportService(db);
const reportWorker=new AnalyticsReportWorkerService(db,dashboard);
const schedules=new AnalyticsReportScheduleService(db);
const scheduler=new AnalyticsReportSchedulerWorkerService(db,reports);

let dailyScheduleId="";
let dailyNextRunAt="";
let reportFrom="";
let reportTo="";
let pausedScheduleId="";

beforeAll(async()=>{
  await db.withActor(MANAGER,async client=>{
    await client.query(
      `DELETE FROM analytics_report_schedules
        WHERE organization_id=$1
          AND idempotency_key IN (
            'scheduler-daily-v1','scheduler-paused-v1'
          )`,
      [ORG]
    );
  });
});

describe.sequential("Stage 6 recurring report scheduler",()=>{
  it("calculates timezone-local daily/weekly/monthly recurrence and period boundaries",async()=>{
    const row=await db.withActor(MANAGER,async client=>{
      return (await client.query<{
        daily:Date;weekly:Date;monthly:Date;
        daily_time:string;weekly_dow:number;monthly_day:number;
        month_from:string;month_to:string;
      }>(
        `SELECT
          app.next_analytics_report_schedule_run(
            'daily','Asia/Tashkent','08:30'::time,NULL,NULL,
            '2037-03-10T12:00:00Z'
          ) AS daily,
          app.next_analytics_report_schedule_run(
            'weekly','Asia/Tashkent','09:15'::time,1,NULL,
            '2037-03-10T12:00:00Z'
          ) AS weekly,
          app.next_analytics_report_schedule_run(
            'monthly','Asia/Tashkent','10:45'::time,NULL,5,
            '2037-03-10T12:00:00Z'
          ) AS monthly,
          to_char(
            app.next_analytics_report_schedule_run(
              'daily','Asia/Tashkent','08:30'::time,NULL,NULL,
              '2037-03-10T12:00:00Z'
            ) AT TIME ZONE 'Asia/Tashkent',
            'HH24:MI'
          ) AS daily_time,
          extract(
            isodow FROM app.next_analytics_report_schedule_run(
              'weekly','Asia/Tashkent','09:15'::time,1,NULL,
              '2037-03-10T12:00:00Z'
            ) AT TIME ZONE 'Asia/Tashkent'
          )::integer AS weekly_dow,
          extract(
            day FROM app.next_analytics_report_schedule_run(
              'monthly','Asia/Tashkent','10:45'::time,NULL,5,
              '2037-03-10T12:00:00Z'
            ) AT TIME ZONE 'Asia/Tashkent'
          )::integer AS monthly_day,
          (
            SELECT from_date::text
            FROM app.analytics_report_schedule_period(
              'previous_month','Asia/Tashkent','2037-04-01T03:00:00Z'
            )
          ) AS month_from,
          (
            SELECT to_date::text
            FROM app.analytics_report_schedule_period(
              'previous_month','Asia/Tashkent','2037-04-01T03:00:00Z'
            )
          ) AS month_to`
      )).rows[0];
    });

    expect(row.daily.getTime())
      .toBeGreaterThan(new Date("2037-03-10T12:00:00Z").getTime());
    expect(row.weekly.getTime())
      .toBeGreaterThan(new Date("2037-03-10T12:00:00Z").getTime());
    expect(row.monthly.getTime())
      .toBeGreaterThan(new Date("2037-03-10T12:00:00Z").getTime());
    expect(row.daily_time).toBe("08:30");
    expect(row.weekly_dow).toBe(1);
    expect(row.monthly_day).toBe(5);
    expect(row.month_from).toBe("2037-03-01");
    expect(row.month_to).toBe("2037-03-31");
  });

  it("creates a daily schedule idempotently and derives property timezone",async()=>{
    const first=await schedules.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"json",
      cadence:"daily",
      periodKind:"previous_day",
      localTime:"00:05",
      propertyId:PROPERTY
    },"scheduler-daily-v1");
    if(!first)throw new Error("EXPECTED_DAILY_SCHEDULE");

    dailyScheduleId=first.reportScheduleId;
    dailyNextRunAt=first.nextRunAt;

    expect(first.status).toBe("active");
    expect(first.timezone).toBe("Asia/Tashkent");
    expect(first.idempotentReplay).toBe(false);

    const replay=await schedules.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"json",
      cadence:"daily",
      periodKind:"previous_day",
      localTime:"00:05",
      propertyId:PROPERTY
    },"scheduler-daily-v1");
    if(!replay)throw new Error("EXPECTED_DAILY_REPLAY");

    expect(replay.reportScheduleId).toBe(dailyScheduleId);
    expect(replay.idempotentReplay).toBe(true);

    await expect(schedules.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"csv",
      cadence:"daily",
      periodKind:"previous_day",
      localTime:"00:05",
      propertyId:PROPERTY
    },"scheduler-daily-v1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("creates a paused schedule and rejects invalid weekly configuration",async()=>{
    await expect(schedules.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"json",
      cadence:"weekly",
      periodKind:"previous_7_days",
      localTime:"09:00",
      propertyId:PROPERTY
    },"scheduler-invalid-weekly")).rejects.toThrow(
      "INVALID_WEEKLY_REPORT_SCHEDULE"
    );

    const created=await schedules.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"csv",
      cadence:"weekly",
      periodKind:"previous_7_days",
      localTime:"09:00",
      isoWeekday:1,
      propertyId:PROPERTY
    },"scheduler-paused-v1");
    if(!created)throw new Error("EXPECTED_PAUSED_FIXTURE");

    pausedScheduleId=created.reportScheduleId;
    const paused=await schedules.pause(MANAGER,pausedScheduleId);
    if(!paused)throw new Error("EXPECTED_PAUSED_SCHEDULE");
    expect(paused.status).toBe("paused");
  });

  it("enqueues the exact scheduled period once and advances without drift",async()=>{
    const period=await db.withActor(MANAGER,async client=>{
      return (await client.query<{from_date:string;to_date:string}>(
        `SELECT from_date::text,to_date::text
         FROM app.analytics_report_schedule_period(
           'previous_day','Asia/Tashkent',$1::timestamptz
         )`,
        [dailyNextRunAt]
      )).rows[0];
    });
    reportFrom=period.from_date;
    reportTo=period.to_date;

    await db.withActor(MANAGER,async client=>{
      await client.query(
        `INSERT INTO analytics_property_daily_rollups(
           organization_id,property_id,local_date,currency,
           available_unit_nights,occupied_unit_nights,booking_count,
           accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
           occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
         ) VALUES(
           $1,$2,$3::date,'UZS',
           10,6,3,12000,13000,12000,
           0.6,2000,1200,12,2,now()
         )
         ON CONFLICT(organization_id,property_id,local_date,currency)
         DO UPDATE SET
           available_unit_nights=EXCLUDED.available_unit_nights,
           occupied_unit_nights=EXCLUDED.occupied_unit_nights,
           booking_count=EXCLUDED.booking_count,
           accommodation_revenue_minor=EXCLUDED.accommodation_revenue_minor,
           gross_revenue_minor=EXCLUDED.gross_revenue_minor,
           net_revenue_minor=EXCLUDED.net_revenue_minor,
           occupancy=EXCLUDED.occupancy,
           adr_minor=EXCLUDED.adr_minor,
           revpar_minor=EXCLUDED.revpar_minor,
           avg_lead_time_days=EXCLUDED.avg_lead_time_days,
           avg_stay_nights=EXCLUDED.avg_stay_nights,
           refreshed_at=now()`,
        [ORG,PROPERTY,reportFrom]
      );
    });

    const dueNow=new Date(new Date(dailyNextRunAt).getTime()+1000);
    const cycle=await scheduler.runCycle(20,dueNow);

    const dailyResult=cycle.results.find(
      x=>x.reportScheduleId===dailyScheduleId
    );
    if(!dailyResult||!dailyResult.reportJobId){
      throw new Error("EXPECTED_SCHEDULED_REPORT_JOB");
    }

    expect(dailyResult.status).toBe("enqueued");
    expect(dailyResult.scheduledFor).toBe(dailyNextRunAt);
    expect(new Date(dailyResult.nextRunAt!).getTime())
      .toBeGreaterThan(new Date(dailyNextRunAt).getTime());

    expect(cycle.results.some(x=>x.reportScheduleId===pausedScheduleId))
      .toBe(false);

    const schedule=await schedules.get(MANAGER,dailyScheduleId);
    if(!schedule)throw new Error("EXPECTED_ADVANCED_SCHEDULE");
    expect(schedule.lastEnqueuedAt).toBe(dailyNextRunAt);
    expect(schedule.nextRunAt).toBe(dailyResult.nextRunAt);

    const report=await reports.get(MANAGER,dailyResult.reportJobId);
    if(!report)throw new Error("EXPECTED_SCHEDULED_JOB");
    expect(report.status).toBe("queued");
    expect(report.from).toBe(reportFrom);
    expect(report.to).toBe(reportTo);

    const replayCycle=await scheduler.runCycle(20,dueNow);
    expect(
      replayCycle.results.some(x=>x.reportScheduleId===dailyScheduleId)
    ).toBe(false);

    const reportCycle=await reportWorker.runCycle(20);
    expect(reportCycle.completed).toBeGreaterThanOrEqual(1);

    const artifact=await reports.artifact(MANAGER,dailyResult.reportJobId);
    const parsed=JSON.parse(artifact.content.toString("utf8"));
    expect(parsed.period).toEqual({from:reportFrom,to:reportTo});
    expect(parsed.kpisByCurrency[0]).toMatchObject({
      currency:"UZS",
      availableUnitNights:10,
      occupiedUnitNights:6,
      accommodationRevenueMinor:"12000",
      adrMinor:"2000.00",
      revparMinor:"1200.00"
    });
  });

  it("resumes a paused schedule and keeps manager schedules hidden from scoped host",async()=>{
    await expect(schedules.get(HOST,dailyScheduleId))
      .rejects.toThrow("REPORT_SCHEDULE_NOT_FOUND");

    const resumed=await schedules.resume(MANAGER,pausedScheduleId);
    if(!resumed)throw new Error("EXPECTED_RESUMED_SCHEDULE");
    expect(resumed.status).toBe("active");
    expect(new Date(resumed.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
