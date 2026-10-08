import { supabase } from './supabase';
import { organizationService } from './organization.service';

export interface CalendarEvent { id: string; title: string; event_date: string; created_by: string | null }

/** Company calendar: events live in calendar_events; holidays stay in the shared settings list so leave day counts use them. */
export const calendarService = {
  async listEvents(from: string, to: string): Promise<CalendarEvent[]> {
    const { data, error } = await supabase.from('calendar_events').select('id,title,event_date,created_by')
      .gte('event_date', from).lte('event_date', to).order('event_date');
    if (error) throw new Error(error.message);
    return data || [];
  },
  async addEvent(title: string, date: string): Promise<CalendarEvent> {
    const { data, error } = await supabase.rpc('add_calendar_event', { p_title: title.trim(), p_date: date });
    if (error) throw new Error(error.message);
    return data;
  },
  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_calendar_event', { p_id: id });
    if (error) throw new Error(error.message);
  },
  async addHoliday(name: string, date: string): Promise<void> {
    const { error } = await supabase.rpc('add_org_holiday', { p_name: name.trim(), p_date: date });
    if (error) throw new Error(error.message);
    organizationService.clearCache();
  },
  async deleteHoliday(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_org_holiday', { p_id: id });
    if (error) throw new Error(error.message);
    organizationService.clearCache();
  },
};
