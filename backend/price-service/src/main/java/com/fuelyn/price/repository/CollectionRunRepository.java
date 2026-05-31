package com.fuelyn.price.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fuelyn.price.model.entity.CollectionRun;

/** Repository for {@link CollectionRun} tracking entities. */
@Repository
public interface CollectionRunRepository extends JpaRepository<CollectionRun, Long> {

    List<CollectionRun> findTop10ByOrderByStartedAtDesc();
}
