#!/bin/sh
#
# @license   http://www.gnu.org/licenses/gpl.html GPL Version 3
# @author    Volker Theile <volker.theile@openmediavault.org>
# @author    OpenMediaVault Plugin Developers <plugins@omv-extras.org>
# @copyright Copyright (c) 2009-2013 Volker Theile
# @copyright Copyright (c) 2013-2017 OpenMediaVault Plugin Developers
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.

set -e

. /usr/share/openmediavault/scripts/helper-functions

SERVICE_XPATH_NAME="docker"
SERVICE_XPATH="/config/services/${SERVICE_XPATH_NAME}"


if omv_config_exists "${SERVICE_XPATH}/apiPort"; then
    omv_config_delete "${SERVICE_XPATH}/apiPort"
fi

if omv_config_exists "${SERVICE_XPATH}/version"; then
    omv_config_delete "${SERVICE_XPATH}/version"
fi

if omv_config_exists "${SERVICE_XPATH}/versionInfo"; then
    omv_config_delete "${SERVICE_XPATH}/versionInfo"
fi

if omv_config_exists "${SERVICE_XPATH}/dockermntent"; then
    omv_config_delete "${SERVICE_XPATH}/dockermntent"
fi

if omv_config_exists "${SERVICE_XPATH}/orgpath"; then
    omv_config_delete "${SERVICE_XPATH}/orgpath"
fi

if omv_config_exists "${SERVICE_XPATH}/uuid"; then
    omv_config_delete "${SERVICE_XPATH}/uuid"
fi

if omv_config_exists "${SERVICE_XPATH}/destpath"; then
    omv_config_delete "${SERVICE_XPATH}/destpath"
fi



