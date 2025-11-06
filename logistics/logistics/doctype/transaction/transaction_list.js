frappe.listview_settings["Transaction"] = {
    onload: function(listview) {
        // Fix malformed filter URLs
        // When filters are incorrectly serialized (e.g., name=["like","%2219%"]),
        // we need to parse and reconstruct them properly
        
        function fix_malformed_filters() {
            const url_params = new URLSearchParams(window.location.search);
            const name_param = url_params.get('name');
            
            if (name_param && name_param.startsWith('[')) {
                try {
                    // Try to decode URL-encoded quotes, but handle malformed sequences gracefully
                    let filter_value = name_param;
                    try {
                        filter_value = decodeURIComponent(name_param);
                    } catch (e) {
                        // If decodeURIComponent fails, try to manually decode common patterns
                        // Replace %22 with " (double quote)
                        filter_value = name_param.replace(/%22/g, '"');
                    }
                    
                    // Parse the JSON array
                    let filter_array = JSON.parse(filter_value);
                    
                    if (Array.isArray(filter_array) && filter_array.length >= 2) {
                        const operator = filter_array[0];
                        let value = filter_array[1];
                        
                        // Clean up the value (remove any extra encoding or quotes)
                        if (typeof value === 'string') {
                            // Handle cases where value might be URL-encoded quotes like "%2219%" or malformed "%263%"
                            // First try to decode, but catch errors
                            try {
                                value = decodeURIComponent(value);
                            } catch (e) {
                                // If decoding fails, just remove % signs and quotes
                                value = value.replace(/%/g, '').replace(/^["']|["']$/g, '').replace(/"/g, '').replace(/'/g, '');
                            }
                            // Remove any remaining quotes
                            value = value.replace(/^["']|["']$/g, '').replace(/"/g, '').replace(/'/g, '');
                        }
                        
                        // Reconstruct proper filter using Frappe's filter API
                        if (operator === 'like' && value) {
                            // Remove malformed parameter from URL first
                            url_params.delete('name');
                            const new_url = window.location.pathname + (url_params.toString() ? '?' + url_params.toString() : '');
                            window.history.replaceState({}, '', new_url);
                            
                            // Add proper filter
                            if (listview.filter_area && listview.filter_area.add) {
                                listview.filter_area.add([
                                    ['Transaction', 'name', 'like', `%${value}%`]
                                ]);
                            }
                            return true;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse malformed filter:', e, name_param);
                    // Remove malformed parameter to prevent errors
                    url_params.delete('name');
                    const new_url = window.location.pathname + (url_params.toString() ? '?' + url_params.toString() : '');
                    window.history.replaceState({}, '', new_url);
                }
            }
            return false;
        }
        
        // Fix filters on initial load
        // Use setTimeout to ensure listview.filter_area is initialized
        setTimeout(function() {
            if (fix_malformed_filters()) {
                // Refresh the list view after fixing filters
                if (listview.refresh) {
                    listview.refresh();
                }
            }
        }, 500);
        
        // Also intercept refresh to fix filters before they cause issues
        const original_refresh = listview.refresh;
        if (original_refresh) {
            listview.refresh = function() {
                fix_malformed_filters();
                return original_refresh.apply(this, arguments);
            };
        }
    }
};

