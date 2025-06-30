// eslint-disable-next-line no-restricted-imports
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
// eslint-disable-next-line no-restricted-imports
import moment from 'moment-timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Yes, wrapping dayjs is a bit annoying and might seem overly paranoid. However, I feel strongly
 * about not letting Dayjs instances leak into the rest of the codebase. Having Dayjs objects
 * floating around the application leads to inconsistent timezone handling, makes testing more
 * difficult, and creates subtle bugs that are hard to track down.
 * 
 * By wrapping dayjs completely and only exposing plain JavaScript Date objects, we get several
 * key benefits:
 * 1. Consistent timezone handling through a single configuration point
 * 2. Simpler testing since we only need to mock this one library
 * 3. Type safety - the rest of the codebase only deals with standard Date objects
 * 4. No risk of dayjs method chains creating unexpected timezone shifts
 * 
 * The Library interface gives us full control over all date operations while keeping the messy
 * details of timezone manipulation contained in one place. Yes it's more code, but the peace of
 * mind is worth it.
 */
export interface Utility {
    now: () => Date;
    date: (date: string | number | Date | null | undefined) => Date;
    parse: (date: string | number | Date | null | undefined, format: string) => Date;
    addDays: (date: Date, days: number) => Date;
    addMonths: (date: Date, months: number) => Date;
    addYears: (date: Date, years: number) => Date;
    format: (date: Date, format: string) => string;
    subDays: (date: Date, days: number) => Date;
    subMonths: (date: Date, months: number) => Date;
    subYears: (date: Date, years: number) => Date;
    startOfMonth: (date: Date) => Date;
    endOfMonth: (date: Date) => Date;
    startOfYear: (date: Date) => Date;
    endOfYear: (date: Date) => Date;
    isBefore: (date: Date, other: Date) => boolean;
    isAfter: (date: Date, other: Date) => boolean;
}

/**
 * Helper function to safely convert dayjs back to Date with timezone awareness
 */
const toDateSafe = (dayjsInstance: dayjs.Dayjs) => {
    // Use UTC conversion to ensure consistent behavior across timezones
    return dayjsInstance.utc().toDate();
};

export const create = (parameters: { timezone: string }) => {
    const { timezone } = parameters;
    const now = () => {
        return date(undefined);
    }

    const date = (date: string | number | Date | null | undefined) => {
        let value: dayjs.Dayjs;
        if (date) {
            value = dayjs.tz(date, timezone);
        } else {
            value = dayjs().tz(timezone);
        }

        if (!value.isValid()) {
            throw new Error(`Invalid date: ${date}`);
        }

        return toDateSafe(value);
    }

    const parse = (date: string | number | Date | null | undefined, format: string) => {
        const value = dayjs.tz(date, format, timezone);
        if (!value.isValid()) {
            throw new Error(`Invalid date: ${date}, expected format: ${format}`);
        }

        return toDateSafe(value);
    }

    const addDays = (date: Date, days: number) => {
        return toDateSafe(dayjs.tz(date, timezone).add(days, 'day'));
    }

    const addMonths = (date: Date, months: number) => {
        return toDateSafe(dayjs.tz(date, timezone).add(months, 'month'));
    }

    const addYears = (date: Date, years: number) => {
        return toDateSafe(dayjs.tz(date, timezone).add(years, 'year'));
    }

    const format = (date: Date, format: string) => {
        return dayjs.tz(date, timezone).format(format);
    }

    const subDays = (date: Date, days: number) => {
        return toDateSafe(dayjs.tz(date, timezone).subtract(days, 'day'));
    }

    const subMonths = (date: Date, months: number) => {
        return toDateSafe(dayjs.tz(date, timezone).subtract(months, 'month'));
    }

    const subYears = (date: Date, years: number) => {
        return toDateSafe(dayjs.tz(date, timezone).subtract(years, 'year'));
    }

    const startOfMonth = (date: Date) => {
        return toDateSafe(dayjs.tz(date, timezone).startOf('month'));
    }

    const endOfMonth = (date: Date) => {
        return toDateSafe(dayjs.tz(date, timezone).endOf('month'));
    }

    const startOfYear = (date: Date) => {
        return toDateSafe(dayjs.tz(date, timezone).startOf('year'));
    }

    const endOfYear = (date: Date) => {
        return toDateSafe(dayjs.tz(date, timezone).endOf('year'));
    }

    const isBefore = (date: Date, other: Date) => {
        return dayjs.tz(date, timezone).isBefore(dayjs.tz(other, timezone));
    }

    const isAfter = (date: Date, other: Date) => {
        return dayjs.tz(date, timezone).isAfter(dayjs.tz(other, timezone));
    }

    return { now, date, parse, addDays, addMonths, addYears, format, subDays, subMonths, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear, isBefore, isAfter };
}

export const validTimezones = () => {
    return moment.tz.names();
}
