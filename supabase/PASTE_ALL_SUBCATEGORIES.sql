-- TrendMart: seed ALL built-in sub-categories (safe to re-run)
-- Paste in Supabase SQL Editor if SERVICE_ROLE seed API is not configured.

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
-- Fast Food
('Fast Food & Restaurants', 'Burgers', 'burgers', 'Burgers and smash burgers', '🍔', 1, false),
('Fast Food & Restaurants', 'Shawarma & Rolls', 'shawarma-rolls', 'Shawarma, wraps, rolls', '🌯', 2, false),
('Fast Food & Restaurants', 'Deals & Combos', 'deals-combos', 'Family deals and meal boxes', '🔥', 3, false),
('Fast Food & Restaurants', 'Desi & BBQ', 'desi-bbq', 'Biryani, karahi, BBQ', '🍖', 4, false),
('Fast Food & Restaurants', 'Pizza & Pasta', 'pizza-pasta', 'Pizza and pasta', '🍕', 5, false),
('Fast Food & Restaurants', 'Fries & Sides', 'fries-sides', 'Fries and sides', '🍟', 6, false),
('Fast Food & Restaurants', 'Cafe & Beverages', 'cafe-beverages', 'Coffee, chai, shakes', '☕', 7, false),
('Fast Food & Restaurants', 'Chinese & Asian', 'chinese-asian', 'Chinese and Asian meals', '🥡', 8, false),
('Fast Food & Restaurants', 'Others / General', 'fast-food-restaurants-others', 'Other food items', '📦', 999, true),
-- Tech & IT
('Tech & IT Services', 'Laptop & PC Repair', 'laptop-pc-repair', 'Computer repair', '🖥️', 1, false),
('Tech & IT Services', 'Mobile Repair', 'mobile-repair', 'Phone repair', '📱', 2, false),
('Tech & IT Services', 'Networking & WiFi', 'networking-wifi', 'Network setup', '📶', 3, false),
('Tech & IT Services', 'Software & Web', 'software-web', 'Software and websites', '🌐', 4, false),
('Tech & IT Services', 'Data Recovery', 'data-recovery', 'Recover lost data', '💾', 5, false),
('Tech & IT Services', 'IT Support Packages', 'it-support-packages', 'Ongoing IT support', '🧰', 6, false),
('Tech & IT Services', 'Others / General', 'tech-it-services-others', 'Other IT services', '📦', 999, true),
-- Grocery
('Grocery & Kiryana', 'Atta, Rice & Daal', 'atta-rice-daal', 'Staples and grains', '🌾', 1, false),
('Grocery & Kiryana', 'Oil & Ghee', 'oil-ghee', 'Cooking oils and ghee', '🫙', 2, false),
('Grocery & Kiryana', 'Spices & Masala', 'spices-masala', 'Spices and seasoning', '🌶️', 3, false),
('Grocery & Kiryana', 'Snacks & Biscuits', 'snacks-biscuits', 'Packed snacks', '🍪', 4, false),
('Grocery & Kiryana', 'Beverages', 'beverages', 'Drinks and juices', '🧃', 5, false),
('Grocery & Kiryana', 'Dairy & Eggs', 'dairy-eggs', 'Milk, yogurt, eggs', '🥚', 6, false),
('Grocery & Kiryana', 'Household Essentials', 'household-essentials', 'Cleaning and daily needs', '🧹', 7, false),
('Grocery & Kiryana', 'Others / General', 'grocery-kiryana-others', 'Other grocery items', '📦', 999, true)
ON CONFLICT (category, slug) DO NOTHING;
