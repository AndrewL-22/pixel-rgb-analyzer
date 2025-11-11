<?php
header('Content-Type: application/json; charset=utf-8');

/* Read raw JSON input from the request body and decode it */
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || !isset($data['rows'])) {
    echo json_encode(['success'=>false,'error'=>'No rows provided']);
    exit;
}
$rows = $data['rows'];
if (!is_array($rows) || count($rows) === 0) {
    echo json_encode(['success'=>false,'error'=>'Empty rows']);
    exit;
}

/* Include database configuration file.
   This file creates a mysqli connection in $conn (secure and not readable). */
require_once 'dbconfig.php';

/* Prepare the INSERT statement (parameterized to avoid SQL injection) */
$stmt = $conn->prepare(
    "INSERT INTO shape_data (file_name, x, y, R, G, B, T) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
if (!$stmt) {
    echo json_encode(['success'=>false,'error'=>'Prepare failed: '.$conn->error]);
    $conn->close();
    exit;
}

$inserted = 0;
$conn->begin_transaction();

try {
    /* Loop through each pixel-row object and bind/execute the prepared statement */
    foreach ($rows as $r) {
        /* Sanitize and normalize incoming values */
        $file_name = isset($r['file_name']) ? substr($r['file_name'], 0, 255) : '';
        $x = isset($r['x']) ? intval($r['x']) : 0;
        $y = isset($r['y']) ? intval($r['y']) : 0;
        $R = isset($r['R']) ? max(0, min(255, intval($r['R']))) : 0; /* RGB values make sure they are valid non negative*/
        $G = isset($r['G']) ? max(0, min(255, intval($r['G']))) : 0;
        $B = isset($r['B']) ? max(0, min(255, intval($r['B']))) : 0;
        $T = isset($r['T']) ? $r['T'] : date('Y-m-d H:i:s'); /*added time stamp column to the table to be able to filter by */

        /* Bind parameters and execute for each row */
        $stmt->bind_param('siiiiis', $file_name, $x, $y, $R, $G, $B, $T);
        if (!$stmt->execute()) {
            /* On any execute error, rollback and return a JSON error response */
            $conn->rollback();
            echo json_encode(['success'=>false,'error'=>'Insert failed: '.$stmt->error]);
            $stmt->close();
            $conn->close();
            exit;
        }
        $inserted++;
    }

    /* Commit the transaction after all inserts succeed */
    $conn->commit();
    $stmt->close();
    $conn->close();

    /* Return success with number of inserted rows */
    echo json_encode(['success'=>true,'inserted'=>$inserted]);
} catch (Exception $ex) {
    /* Catch-all: rollback and return exception message as JSON */
    $conn->rollback();
    echo json_encode(['success'=>false,'error'=>$ex->getMessage()]);
}
?>
