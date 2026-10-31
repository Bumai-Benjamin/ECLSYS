-- phpMyAdmin SQL Dump
-- version 4.3.11
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Nov 17, 2025 at 10:08 PM
-- Server version: 5.6.24
-- PHP Version: 5.6.8

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `blockchainvoting`
--

-- --------------------------------------------------------

--
-- Table structure for table `registered_users`
--

CREATE TABLE IF NOT EXISTS `registered_users` (
  `reg_used_id` int(11) NOT NULL,
  `Account_address` varchar(1000) NOT NULL,
  `Is_registered` varchar(3) NOT NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;

--
-- Dumping data for table `registered_users`
--

INSERT INTO `registered_users` (`reg_used_id`, `Account_address`, `Is_registered`) VALUES
(1, '0x9C338Ce88e1502B34dbBd4c6A09495834D242b06', 'Yes');

-- --------------------------------------------------------

--
-- Table structure for table `registration`
--

CREATE TABLE IF NOT EXISTS `registration` (
  `reg_id` int(11) NOT NULL,
  `id_number` varchar(11) NOT NULL,
  `first_name` varchar(150) NOT NULL,
  `last_name` varchar(150) NOT NULL,
  `email_address` varchar(250) NOT NULL,
  `gender` varchar(10) NOT NULL,
  `Dob` date NOT NULL,
  `password` varchar(400) NOT NULL,
  `confirm_password` varchar(400) NOT NULL,
  `Is_registered` varchar(3) NOT NULL,
  `account_address` varchar(1000) NOT NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;

--
-- Dumping data for table `registration`
--

INSERT INTO `registration` (`reg_id`, `id_number`, `first_name`, `last_name`, `email_address`, `gender`, `Dob`, `password`, `confirm_password`, `Is_registered`, `account_address`) VALUES
(4, '84011010111', 'admin', 'admin', 'admin@gmail.com', 'Male', '1985-01-10', '21232f297a57a5a743894a0e4a801fc3', '21232f297a57a5a743894a0e4a801fc3', 'No', '0x8Ca9B242a4147F8f366a0730AA2a5364A5C96E8b'),
(5, '99011010111', 'Rocky', 'Rocky', 'rockyghost101@gmail.com', 'Male', '1999-01-10', '5bab541acd761a3093d7c4202b6e1da9', '5bab541acd761a3093d7c4202b6e1da9', 'YES', '0x9C338Ce88e1502B34dbBd4c6A09495834D242b06');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `registered_users`
--
ALTER TABLE `registered_users`
  ADD PRIMARY KEY (`reg_used_id`);

--
-- Indexes for table `registration`
--
ALTER TABLE `registration`
  ADD PRIMARY KEY (`reg_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `registered_users`
--
ALTER TABLE `registered_users`
  MODIFY `reg_used_id` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=2;
--
-- AUTO_INCREMENT for table `registration`
--
ALTER TABLE `registration`
  MODIFY `reg_id` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=6;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
