<?php
/**
 * Copyright (c) 2015-2017 OpenMediaVault Plugin Developers
 *
 * @category OMVModuleDockerUtil
 * @package  Openmediavault-docker-gui
 * @author   OpenMediaVault Plugin Developers <plugins@omv-extras.org>
 * @license  http://www.gnu.org/copyleft/gpl.html GNU General Public License
 * @link     https://github.com/OpenMediaVault-Plugin-Developers/openmediavault-docker-gui
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

require_once "Exception.php";
require_once "Image.php";
require_once "Container.php";

use OMV\Config\Database;
use OMV\Config\ConfigObject;
use OMV\Rpc\ServiceAbstract;
use OMV\Engine\Notify;
use OMV\System\SystemCtl;
use OMV\System\Process;
use OMV\Rpc\Rpc;
use OMV\System\Filesystem\Filesystem;


/**
 * Helper class for Docker module
 *
 * @category Class
 * @package  Openmediavault-docker-gui
 * @author   OpenMediaVault Plugin Developers <plugins@omv-extras.org>
 * @license  http://www.gnu.org/copyleft/gpl.html GNU General Public License
 * @link     https://github.com/OpenMediaVault-Plugin-Developers/openmediavault-docker-gui
 *
 */
class OMVModuleDockerUtil
{
    static private $dataModelPath = 'conf.service.docker';
    static private $database;

    /**
     * Returns the result of a call to the Docker API
     *
     * @param string $url The URL to use in the API call
     *
     * @return string $response The response from the API call
     */
    public static function doApiCall($url)
    {
        $curl = curl_init();
        curl_setopt_array(
            $curl, array(
                CURLOPT_RETURNTRANSFER => 1,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_UNIX_SOCKET_PATH => "/var/run/docker.sock"
            )
        );
        curl_setopt($curl, CURLOPT_URL, $url);
        if (!($response = curl_exec($curl))) {
            throw new OMVModuleDockerException(
                'Error: "' . curl_error($curl) . '" - Code: ' .
                curl_errno($curl)
            );
        }
        curl_close($curl);
        return $response;
    }

    /**
     * Stops the Docker service
     *
     * @return void
     */
    public static function stopDockerService()
    {
        do {
            //Wait for the docker service to stop before making config changes
            $systemCtl = new SystemCtl("docker.socket");
            $systemCtl->stop();
            $systemCtl2 = new SystemCtl("docker");
            $systemCtl2->stop();
            sleep(1);
        } while ($systemCtl->isActive() || $systemCtl2->isActive());
    }

    /**
     * Starts the Docker service
     *
     * @return void
     */
    public static function startDockerService()
    {
        //Start the daemon again after changes have been made
        $systemCtl = new SystemCtl("docker");
        $systemCtl->start();

    }

    /**
     * Returns an array with maclvan network names and their subnets
     *
     * @param bool $incDangling Flag to filter dangling images (not used)
     *
     * @return array $objects An array with macvlan names and subnets
     *
     */
    public static function getMacVlanNetworks($incDangling)
    {
        $objects=array();
        $url = "http::/networks/?filters=%7B%22driver%22%3A%7B%22macvlan%22%3Atrue%7D%7D";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $macvlan_data = json_decode($response);
        $objects = array();
        //Iterate over each macvlan object that the api returns
        foreach ($macvlan_data as $item) {
        //get the macvlan name
            $tmp=array(
                "name"      => $item->Name,
                "description"    => $item->Name . " (" . $item->IPAM->Config[0]->Subnet . ")");
        //pass the macvlan names to an array
            array_push($objects, $tmp);
        }
        return $objects;
    }


    /**
     * Returns an array with Image objects on the system
     *
     * @param bool $incDangling Flag to filter dangling images (not used)
     *
     * @return array $objects An array with Image objects
     *
     */
    public static function getImages($incDangling)
    {
        $objects=array();
        $url = "http::/images/json?all=0";
        /*
        if ($incDangling) {
        $url .= "0";
        } else {
        $url .= "1";
        }
         */
        $response = OMVModuleDockerUtil::doApiCall($url);
        $data = array();
        foreach (json_decode($response) as $item) {
            $data[substr($item->Id, 0, 12)] = $item;
        }
        foreach ($data as $item) {
            $image = new OMVModuleDockerImage($item->Id, $data);
            $tmp=array(
                "repository"=>rtrim(ltrim($image->getRepository(), "<"), ">"),
                "tag"=>rtrim(ltrim($image->getTag(), "<"), ">"),
                "id"=>$image->getId(),
                "created"=>$image->getCreated(),
                "size"=>$image->getSize(),
                "ports"=>$image->getPorts(),
                "envvars"=>$image->getEnvVars(),
                "imagevolumes" => $image->getVolumes());
            array_push($objects, $tmp);
        }
        return $objects;
    }

    /**
     * Returns an array with Images to be presented in the grid
     *
     * @param bool $incDangling Flag to filter dangling images (not used)
     *
     * @return array $objects An array with Image objects
     *
     */
    public static function getImageList($incDangling)
    {
        $objects=array();
        $now = date("c");
        $url = "http::/images/json?all=0";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $data = array();
        foreach (json_decode($response) as $item) {
            $repoTags = explode(":", $item->RepoTags[0]);
            $repository = $repoTags[0];
            $tag = $repoTags[1];
            if (strcmp($repository, "<none>") === 0) {
                $repository = "none";
            }
            if (strcmp($tag, "<none>") === 0) {
                $tag = "none";
            }
            $created = OMVModuleDockerUtil::getWhen(
                $now,
                date("c", $item->Created)
            ) . " ago";
            $tmp = array(
                "repository" => $repository,
                "tag" => $tag,
                "id" => substr($item->Id, 7, 12),
                "created" => $created,
                "size" => $item->VirtualSize
            );
            array_push($objects, $tmp);
        }
        return $objects;
    }

    /**
     * Returns a single image from it's ID
     *
     * @param string $id      The ID of the image to retrieve
     *
     * @return OMVModuleDockerImage $image A single Docker image
     *
     */
    public static function getImage($id)
    {
        $objects = array();
        $url = "http::/images/json?all=1";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $data = array();
        foreach (json_decode($response) as $item) {
            $data[substr($item->Id, 7, 12)] = $item;
        }
        return (new OMVModuleDockerImage(substr($data[$id]->Id, 7, 12), $data));
    }


    /**
     * Returns an array with Container objects on the system
     *
     *
     * @return array $objects An array with Container objects
     *
     */
    public static function getContainers()
    {
        $objects = array();
        $url = "http::/containers/json?all=1";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $data = array();
        foreach (json_decode($response) as $item) {
            $data[substr($item->Id, 0, 12)] = $item;
        }
        foreach ($data as $item) {
            $container = new OMVModuleDockerContainer(
                $item->Id,
                $data
            );
            $ports = "";
            foreach ($container->getPorts() as $exposedport => $hostports) {
                if ($hostports) {
                    foreach ($hostports as $hostport) {
                        $ports .= $hostport["HostIp"] . ":" .
                            $hostport["HostPort"] .
                            "->" . $exposedport . ", ";
                    }
                } else {
                    $ports .= $exposedport . ", ";
                }
            }
            $image = OMVModuleDockerUtil::getImage(
                substr($container->getImageId(), 0, 12));
            $ports = rtrim($ports, ", ");
            $obj = array(
                "id" => $container->getId(),
                "image" => $container->getImage(),
                "command" => $container->getCommand(),
                "created" => $container->getCreated(),
                "state" => $container->getState(),
                "status" => $container->getStatus(),
                "name" => $container->getName(),
                "privileged" => $container->getPrivileged(),
                "restartpolicy" => $container->getRestartPolicy(),
                "maxretries" => $container->getMaxRetries(),
                "networkmode" => ucfirst($container->getNetworkMode()),
                "macvlan_network" => $container->getMacVlanContainerNetwork(),
                "macvlan_ipaddress" => $container->getMacVlanContainerIpAddress(),
                "envvars" => $image->getEnvVars(),
                "cenvvars" => $container->getEnvironmentVariables(),
                "exposedports" => $image->getPorts(),
                "portbindings" => $container->getPortBindings(),
                "bindmounts" => $container->getBindMounts(),
                "ports" => $ports,
                "hasmounts" => $container->hasMounts(),
                "volumesfrom" => $container->getVolumesFrom(),
                "extraargs" => $container->getExtraArgs(),
                "hostname" => $container->getHostName(),
                "timesync" => $container->syncsTime(),
                "imagevolumes" => $image->getVolumes(),
                "containercommand" => $container->getContainerCommand());
            array_push($objects, $obj);
        }
        return $objects;
    }

    /**
     * Returns an array with Containers for presentation in grid
     *
     * @return array $objects An array with Container objects
     *
     */
    public static function getContainerList()
    {
        $objects = array();
        $now = date("c");
        $url = "http::/containers/json?all=1";
        $response = OMVModuleDockerUtil::doApiCall($url);
        foreach (json_decode($response) as $item) {
            $ports = "";
            if (isset($item->Ports)) {
                foreach ($item->Ports as $port) {
                    if (strcmp((string)$port->IP, "") !== 0) {
                        $ports .= $port->IP . ":" .
                            $port->PublicPort . "->";
                    }
                    $ports .= $port->PrivatePort . "/" .
                        $port->Type . ", ";
                }
            }
            $ports = rtrim($ports, ", ");
            $state = "running";
            if (preg_match('/^Exited \(0\).*$/', $item->Status)) {
                $state = "stopped";
            } elseif (preg_match('/^Exited.*$/', $item->Status)) {
                $state = "dead";
            } elseif (strcmp((string)$item->Status, "Created") === 0) {
                $state = "stopped";
            }

            $extraargs = $item->Labels->omv_docker_extra_args;
            $containercommand = $item->Labels->omv_docker_container_command;

            array_push(
                $objects,
                array(
                    "id" => substr($item->Id, 0, 12),
                    "image" => $item->Image,
                    "command" => $item->Command,
                    "status" => $item->Status,
                    "ports" => $ports,
                    "name" => ltrim($item->Names[0], "/"),
                    "created" => OMVModuleDockerUtil::getWhen(
                        $now,
                        date("c", $item->Created)
                    ) . " ago",
                    "state" => $state,
                    "extraargs" => $extraargs,
                    "containercommand" => $containercommand
                )
            );
        }
        return $objects;
    }


    /**
     * Returns a single container from it's ID
     *
     * @param string $id      The ID of the container to retrieve
     *
     * @return OMVModuleDockerContainer $container A single container object
     *
     */
    public static function getContainer($id)
    {
        $objects = array();
        $url = "http::/containers/json?all=1";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $data = array();
        foreach (json_decode($response) as $item) {
            $data[substr($item->Id, 0, 12)] = $item;
        }
        return (new OMVModuleDockerContainer($data[$id]->Id, $data));
    }

    /**
     * Returns an array with containers name that are connected requested network
     *
     * @param string $network   Network name to inspect in API call
     *
     * @return array $objects An array with Image objects
     *
     */
    public static function getContainersInNetwork($network)
    {
        $objects=array();
        $url = "http::/networks/" . $network;
        $response = OMVModuleDockerUtil::doApiCall($url);
        $cdata = json_decode($response);
        foreach ($cdata->Containers as $key=>$value) {
            $tmp=$value->Name;
            array_push($objects, $tmp);
        }
        return $objects;
    }



    /**
     * Returns an array with Networks to be presented in the grid
     *
     * @return array $objects An array with Image objects
     *
     */
    public static function getNetworkList()
    {
        $objects=array();
        $now = date("c");
        $url = "http::/networks";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $data = array();
        foreach (json_decode($response) as $item) {
            $tmp = array(
              "id" => substr($item->Id, 7, 12),
              "name" => $item->Name,
              "driver" => $item->Driver,
              "scope" => $item->Scope,
              "subnet" => $item->IPAM->Config[0]->Subnet,
              "containers" => OMVModuleDockerUtil::getContainersInNetwork($item->Name)
            );
            array_push($objects, $tmp);
        }
        return $objects;
    }

    /**
     * Returns a string representing a time sometime in the past
     *
     * @param string $now       Current timestamp
     * @param string $eventTime Timestamp to compare with
     *
     * @return string $when A string representaion of a past time
     *
     */
    public static function getWhen($now, $eventTime)
    {
        $when = "";
        $diff = date_diff(new DateTime($now), new DateTime($eventTime));
        if ($diff->y > 0) {
            $when = "$diff->y years";
        } elseif ($diff->m > 0) {
            $when = "$diff->m months";
        } elseif ($diff->d > 0) {
            $when = "$diff->d days";
        } elseif ($diff->h > 0) {
            $when = "$diff->h hours";
        } elseif ($diff->i > 0) {
            $when = "$diff->i minutes";
        } elseif ($diff->s > 0) {
            $when = "$diff->s seconds";
        } else {
            $when = "Less than a second";
        }
        return $when;
    }

    /**
     * Convert bytes to human readable format
     *
     * @param int $bytes     Size in bytes to convert
     * @param int $precision Number of decimals to use
     *
     * @return string
     */
    public function bytesToSize($bytes, $precision =1)
    {
        /*
        $kilobyte = 1024;
        $megabyte = $kilobyte * 1024;
        $gigabyte = $megabyte * 1024;
        $terabyte = $gigabyte * 1024;
         */

        $kilobyte = 1000;
        $megabyte = $kilobyte * 1000;
        $gigabyte = $megabyte * 1000;
        $terabyte = $gigabyte * 1000;

        if (($bytes >= 0) && ($bytes < $kilobyte)) {
            return $bytes . ' B';
        } elseif (($bytes >= $kilobyte) && ($bytes < $megabyte)) {
            return round($bytes / $kilobyte, $precision) . ' KB';
        } elseif (($bytes >= $megabyte) && ($bytes < $gigabyte)) {
            return round($bytes / $megabyte, $precision) . ' MB';
        } elseif (($bytes >= $gigabyte) && ($bytes < $terabyte)) {
            return round($bytes / $gigabyte, $precision) . ' GB';
        } elseif ($bytes >= $terabyte) {
            return round($bytes / $terabyte, $precision) . ' TB';
        } else {
            return $bytes . ' B';
        }
    }

    /**
     * Change the Docker daemon settings
     *
     * @param string $absPath Absolute path where Docker files should be moved
     *
     * @return void
     *
     */
    public static function changeDockerSettings($context, $params)
    {
        self::$database = Database::getInstance();
        OMVModuleDockerUtil::stopDockerService();

        $object = array(
            "enabled" => array_boolval($params, "enabled"),
            "sharedfolderref" => $params['sharedfolderref'],
            "cwarn" => array_boolval($params, "cwarn")
        );

        $config = new ConfigObject(self::$dataModelPath);
        $config->setAssoc($object);
        self::$database->set($config);

        $cmd = new \OMV\System\Process("omv-mkconf", "docker");
        $cmd->setRedirect2to1();
        $cmd->execute();

        OMVModuleDockerUtil::startDockerService();
    }

    function getContainersNotInSelectedNetworkList($selectednetwork, $incDangling)
    {
        $objects=array();
        $ctplusnetworks=array();
        $url = "http::/containers/json?all=1";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $cdata = json_decode($response,true);
        foreach ($cdata as $item) {
            $tmp=array(
                "name" => ltrim($item['Names'][0], "/"),
                "networks" => array_keys($item['NetworkSettings']['Networks']));
            array_push($ctplusnetworks, $tmp);
        }
        foreach ($ctplusnetworks as $item) {
            if (!in_array($selectednetwork,$item['networks'])) {
                $tmp=array(
                    "name" => $item['name']);
                array_push($objects, $tmp);
            }
        }
        return $objects;
    }

    function getContainersInSelectedNetworkList($selectednetwork, $incDangling)
    {
        $objects=array();
        $ctplusnetworks=array();
        $url = "http::/containers/json?all=1";
        $response = OMVModuleDockerUtil::doApiCall($url);
        $cdata = json_decode($response,true);
        foreach ($cdata as $item) {
            $tmp=array(
                "name" => ltrim($item['Names'][0], "/"),
                "networks" => array_keys($item['NetworkSettings']['Networks']));
            array_push($ctplusnetworks, $tmp);
        }
        foreach ($ctplusnetworks as $item) {
            if (in_array($selectednetwork,$item['networks'])) {
                $tmp=array(
                    "name" => $item['name']);
                array_push($objects, $tmp);
            }
        }
        return $objects;
    }


}
