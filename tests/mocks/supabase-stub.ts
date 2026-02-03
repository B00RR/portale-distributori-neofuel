export const createClient = () => ({
    from: () => ({
        select: () => ({
            eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
                maybeSingle: () => Promise.resolve({ data: null, error: null })
            }),
            order: () => ({
                range: () => Promise.resolve({ data: [], count: 0 })
            })
        })
    })
});
