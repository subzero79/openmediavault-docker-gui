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
OMV_FSTAB_DM_NAME="conf.system.filesystem.mountpoint"
OMV_DOCKER_BIND_MOUNT="/var/lib/docker/openmediavault"

clean_docker_mount_bind () {
  echo "Deleting fstab entry ${OMV_DOCKER_BIND_UUID} from the database..."
  omv-confdbadm delete --uuid ${OMV_DOCKER_BIND_MOUNT_UUID} ${OMV_FSTAB_DM_NAME}
  echo "Regenerating fstab file..."
  omv-mkconf fstab
}

### Stop the docker daemon
systemctl stop docker.socket
systemctl stop docker

### After this section we need to remove fstab entries and unmount any old binds
### Compare the old default bind path against fstab database to see if this configuration exists.
OMV_DOCKER_BIND_MOUNT_UUID=$(omv-confdbadm read ${OMV_FSTAB_DM_NAME} | \
                              jq -r \
                              --arg bind_path $OMV_DOCKER_BIND_MOUNT \
                              '.[]|select(.dir == $bind_path )|.uuid')

### if the uuid bind exists in the database then we proceed
if [ ! -z "$OMV_DOCKER_BIND_MOUNT_UUID" ] ;then
	echo "There is an alternate Docker root directory defined in the plugin and is mounted, proceeding to unmount..."
### Check if mounted
  	if mountpoint -q -- "${OMV_DOCKER_BIND_MOUNT}"; then
    	echo "Unmounting ${OMV_DOCKER_BIND_MOUNT}"
    	umount -f -l "${OMV_DOCKER_BIND_MOUNT}"
    	clean_docker_mount_bind
	else
    	echo "The Docker root directory is not mounted..."
    	clean_docker_mount_bind
  	fi
else
	echo "No alternative Docker root directory registered in the database..."
fi

### Delete old deprecated database entries

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


### Regenerate configuration for the daemon
echo "Regenerating the plugin settings for docker root directory in /etc/default/docker"
omv-mkconf docker

### Start the docker daemon 
systemctl start docker
