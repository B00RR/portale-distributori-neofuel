
import { supabase } from './js/api.js';

async function checkShifts() {
    const { data, error } = await supabase
        .from('shifts')
        .select(`
      *,
      fuel_stations (station_name),
      users!operator_id (full_name)
    `)
        .limit(1);

    if (error) {
        console.error('Error fetching shifts:', error);
    } else {
        console.log('Shifts data:', JSON.stringify(data, null, 2));
    }
}

checkShifts();
