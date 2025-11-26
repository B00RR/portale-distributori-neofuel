
import { supabase } from './js/api.js';

async function checkShiftPistols() {
    const { data, error } = await supabase
        .from('shift_pistols')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching shift_pistols:', error);
    } else {
        console.log('Shift Pistols data:', JSON.stringify(data, null, 2));
    }
}

checkShiftPistols();
