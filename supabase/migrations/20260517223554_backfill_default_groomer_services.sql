update groomers
set services = '[
  "full-groom",
  "bath-brush",
  "haircut",
  "nail-trim",
  "ear-cleaning",
  "de-shed"
]'::jsonb
where services is null
   or services = '[]'::jsonb;
