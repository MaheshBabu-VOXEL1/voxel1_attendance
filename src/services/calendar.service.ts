import { supabase } from './supabase';
import { organizationService } from './organization.service';

export interface CalendarEvent { id: string; title: string; event_date: string; created_by: string | null; kind?: 'event' | 'announcement' }

/** Company calendar: events and manager announcements live in calendar_events; holidays stay in the shared settings list so leave day counts use them. */
export const calendarService = {
  async listEvents(from: string, to: string): Promise<CalendarEvent[]> {
    // '*' so the calendar still loads before migration 0099 adds the kind column.
    const { data, error } = await supabase.from('calendar_events').select('*')
      .gte('event_date', from).lte('event_date', to).order('event_date');
    if (error) throw new Error(error.message);
    return data || [];
  },
  async addEvent(title: string, date: string): Promise<CalendarEvent> {
    const { data, error } = await supabase.rpc('add_calendar_event', { p_title: title.trim(), p_date: date });
    if (error) throw new Error(error.message);
    return data;
  },
  /** Manager announcement for a date: every employee sees it on their home screen on that day. */
  async addAnnouncement(text: string, date: string): Promise<CalendarEvent> {
    const { data, error } = await supabase.rpc('add_calendar_announcement', { p_text: text.trim(), p_date: date });
    if (error) throw new Error(error.message);
    return data;
  },
  /** Announcements shown on one day (today on the employee home screen). */
  async announcementsOn(date: string): Promise<CalendarEvent[]> {
    const { data, error } = await supabase.from('calendar_events').select('*')
      .eq('event_date', date).eq('kind', 'announcement').order('created');
    if (error) throw new Error(error.message);
    return data || [];
  },
  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_calendar_event', { p_id: id });
    if (error) throw new Error(error.message);
  },
  /** Adds a company holiday; leave already covering that day gets the day back. Returns how many leaves changed. */
  async addHoliday(name: string, date: string): Promise<number> {
    const { data, error } = await supabase.rpc('add_org_holiday', { p_name: name.trim(), p_date: date });
    if (error) throw new Error(error.message);
    organizationService.clearCache();
    return typeof data === 'number' ? data : 0;
  },
  /** Removes a company holiday; leave covering that day counts it again. Returns how many leaves changed. */
  async deleteHoliday(id: string): Promise<number> {
    const { data, error } = await supabase.rpc('delete_org_holiday', { p_id: id });
    if (error) throw new Error(error.message);
    organizationService.clearCache();
    return typeof data === 'number' ? data : 0;
  },
};
