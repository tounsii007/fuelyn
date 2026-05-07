package com.fuelyn.api.repository;

import com.fuelyn.api.model.entity.CollectionRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CollectionRunRepository extends JpaRepository<CollectionRun, Long> {

    Optional<CollectionRun> findTopByOrderByStartedAtDesc();
}
