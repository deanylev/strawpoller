#!/bin/bash

set -e
(cd frontend; ember build --prod)
rm -rf public
mv frontend/dist public
mv public/index.html views/pages/index.ejs
